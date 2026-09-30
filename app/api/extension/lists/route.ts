import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { uniqueSlug } from '@/lib/slug'
import { DISPLAY_BULLET_COLS, mapDisplayBullet } from '@/lib/displayBullet'
import { normalizeUrl } from '@/lib/normalizeUrl'

// Lists API for the Chrome extension.
//
//   GET  /api/extension/lists           → { lists: [{ id, name, slug }] }
//     ?bookmark_id=… also returns { member_of: [listId] } — which of those lists
//     already hold that bullet, so the toast can show its checkmarks on a
//     re-save instead of claiming the bullet is filed nowhere.
//     ?url=… asks "is this page already in my Bulletin?" (same url_key dedupe
//     as the save) and adds { saved: { id, title, image } | null } plus that
//     bullet's member_of. The card asks at the click, so an already-saved page
//     opens on its lists instead of offering the save again.
//   POST /api/extension/lists           → op-dispatched:
//     { op: 'create', name, bookmark_id? } → mints a frozen slug, publishes the
//          list, optionally adds the bullet. Returns { list, url, existed }.
//          Idempotent by name: creating a list the user already has returns that
//          list (existed: true) instead of minting a same-name twin.
//     { op: 'add',    list_id, bookmark_id } → add bullet to a list.
//     { op: 'remove', list_id, bookmark_id } → remove bullet from a list.
//
// Auth + CORS mirror /api/extension/save: bearer token (not cookies), so the
// permissive CORS is safe for the chrome-extension:// origin.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// Resolve the bearer token to a token-scoped Supabase client + user, or an
// error response to return directly.
async function authed(request: NextRequest): Promise<
  | { supabase: SupabaseClient; userId: string }
  | { error: NextResponse }
> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) return { error: json({ error: 'missing bearer token' }, 401) }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: json({ error: 'invalid or expired token' }, 401) }
  return { supabase, userId: user.id }
}

// is_private (migration 033): the picker shows a lock on the owner's private
// lists. Display only; nothing at save time switches it.
type ListRow = { id: string; name: string; slug: string; is_private?: boolean }

export async function GET(request: NextRequest) {
  const a = await authed(request)
  if ('error' in a) return a.error

  // ?list_id= → one list in full, bullets in display form (the app's list
  // page). Owner-scoped like everything here.
  const listId = new URL(request.url).searchParams.get('list_id')
  if (listId) {
    const { data: list, error: listErr } = await a.supabase
      .from('lists')
      .select('id, name, slug')
      .eq('user_id', a.userId)
      .eq('id', listId)
      .single()
    if (listErr || !list) return json({ error: 'list not found' }, 404)

    const { data: members, error: memberErr } = await a.supabase
      .from('list_bookmarks')
      .select(`added_at, bookmarks(${DISPLAY_BULLET_COLS})`)
      .eq('list_id', list.id)
      .order('added_at', { ascending: false })
    if (memberErr) return json({ error: memberErr.message }, 400)

    const bullets = (members || [])
      .map((m: any) => m.bookmarks)
      .filter(Boolean)
      .map(mapDisplayBullet)
    return json({ list, bullets })
  }

  // ?url= → the caller's bullet for this page, if any. Indexed on
  // (user_id, url_key), so it rides along at no real cost.
  const pageUrl = new URL(request.url).searchParams.get('url')
  let urlKey: string | null = null
  if (pageUrl) {
    try { urlKey = normalizeUrl(pageUrl) } catch { urlKey = null }
  }
  const savedQuery = urlKey
    ? a.supabase
        .from('bookmarks')
        .select(DISPLAY_BULLET_COLS)
        .eq('user_id', a.userId)
        .eq('url_key', urlKey)
        .limit(1)
        .maybeSingle()
    : Promise.resolve({ data: null })

  // The card links each list to its page, so it needs the owner's handle;
  // fetched alongside the lists rather than waiting on the save response.
  const [{ data, error }, { data: prof }, { data: savedRow }] = await Promise.all([
    a.supabase
      .from('lists')
      .select('id, name, slug, is_private, created_at, list_bookmarks(added_at)')
      .eq('user_id', a.userId),
    a.supabase.from('profiles').select('username').eq('id', a.userId).maybeSingle(),
    savedQuery,
  ])
  if (error) return json({ error: error.message }, 400)
  // Most recently USED first (latest filing, else creation) — the three lists
  // you're actively building sit on top of the card; the rest fold under
  // "All other lists". No semantic ranking: this endpoint used to centroid-
  // rank against the bullet (embedding it on demand when fresh), a full
  // Voyage round-trip between "saved" and the reveal. Tim's ruling
  // 2026-09-02: saves must be fast; 2026-09-22: recency is the order.
  const lastUsed = (l: any): number => {
    const created = Date.parse(String(l.created_at || '')) || 0
    const filed = ((l.list_bookmarks || []) as { added_at: string }[]).reduce(
      (m, x) => Math.max(m, Date.parse(String(x.added_at || '')) || 0),
      0,
    )
    return Math.max(created, filed)
  }
  const lists: ListRow[] = ((data || []) as any[])
    .sort((x, y) => lastUsed(y) - lastUsed(x))
    .map((l) => ({ id: l.id, name: l.name, slug: l.slug, is_private: !!l.is_private }))
  const username: string | null = prof?.username ?? null

  // The card's tile wears the image the bullet's card shows on the site.
  // undefined (key omitted) when no ?url= was asked.
  let saved: { id: string; title: string; image: string | null } | null | undefined
  if (savedRow) {
    const b = mapDisplayBullet(savedRow)
    saved = { id: b.id, title: b.display_title, image: b.display_image }
  } else if (pageUrl) {
    saved = null
  }

  const bookmarkId = saved?.id || new URL(request.url).searchParams.get('bookmark_id')
  if (!bookmarkId || lists.length === 0) return json({ lists, member_of: [], username, saved })

  // Constrained to the caller's own list ids, so this can't be used to probe
  // which of someone else's lists a bullet sits in.
  const { data: mem, error: memErr } = await a.supabase
    .from('list_bookmarks')
    .select('list_id')
    .eq('bookmark_id', bookmarkId)
    .in('list_id', lists.map((l) => l.id))
  if (memErr) return json({ error: memErr.message }, 400)
  const memberOf = (mem || []).map((m) => m.list_id)

  return json({ lists, member_of: memberOf, username, saved })
}

export async function POST(request: NextRequest) {
  const a = await authed(request)
  if ('error' in a) return a.error
  const { supabase, userId } = a

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }

  const op = body.op
  const bookmarkId = typeof body.bookmark_id === 'string' ? body.bookmark_id : null

  // ── create a new (published) list ──────────────────────────────────
  if (op === 'create') {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return json({ error: 'list name required' }, 400)
    // `body.is_private` from older extension builds is ignored — lists are
    // always public (migration 028).

    // Creating a list the user already has is a no-op on the list itself: reuse
    // it and just file the bullet. Without this, "create Testing" twice mints
    // `testing` AND `testing-2` — two lists with the same name, which is never
    // what anyone means. The client dedupes too; this makes it true regardless
    // of double-submits, races, or an older extension build.
    //
    // ilike treats % and _ as wildcards, so escape them — a list named "50%"
    // must not match "50 off". limit(1) rather than maybeSingle() because
    // accounts may already contain same-name pairs from before this guard.
    const escaped = name.replace(/[\\%_]/g, '\\$&')
    const { data: dupes } = await supabase
      .from('lists')
      .select('id, name, slug')
      .eq('user_id', userId)
      .ilike('name', escaped)
      .limit(1)
    let listRow: { id: string; name: string; slug: string } | null = dupes?.[0] || null
    const existed = !!listRow

    // Mint a slug unique among this owner's lists, retrying once if a concurrent
    // create raced us to the same slug (the (user_id, slug) unique index).
    let lastErr: any = null
    for (let attempt = 0; attempt < 2 && !listRow; attempt++) {
      const { data: existing } = await supabase
        .from('lists')
        .select('slug')
        .eq('user_id', userId)
      const taken = (existing || []).map((r: any) => r.slug).filter(Boolean)
      const slug = uniqueSlug(name, taken)

      const r = await supabase
        .from('lists')
        .insert({ user_id: userId, name, slug })
        .select('id, name, slug')
        .single()
      if (!r.error) { listRow = r.data as any; break }
      lastErr = r.error
      if (r.error.code !== '23505') break // not a slug collision — give up
    }
    if (!listRow) return json({ error: lastErr?.message || 'could not create list' }, 400)

    if (bookmarkId) {
      const { error: memErr } = await supabase
        .from('list_bookmarks')
        .insert({ list_id: listRow.id, bookmark_id: bookmarkId })
      if (memErr && memErr.code !== '23505') {
        return json({ error: memErr.message }, 400)
      }
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()
    const origin = new URL(request.url).origin
    const url = prof?.username ? `${origin}/${prof.username}/${listRow.slug}` : null

    return json({ ok: true, list: listRow, url, existed })
  }

  // ── add / remove a bullet from an existing list ───────────────────────
  if (op === 'add' || op === 'remove') {
    const listId = typeof body.list_id === 'string' ? body.list_id : null
    if (!listId || !bookmarkId) {
      return json({ error: 'list_id and bookmark_id required' }, 400)
    }
    if (op === 'add') {
      const { error } = await supabase
        .from('list_bookmarks')
        .insert({ list_id: listId, bookmark_id: bookmarkId })
      if (error && error.code !== '23505') return json({ error: error.message }, 400)
    } else {
      const { error } = await supabase
        .from('list_bookmarks')
        .delete()
        .eq('list_id', listId)
        .eq('bookmark_id', bookmarkId)
      if (error) return json({ error: error.message }, 400)
    }
    return json({ ok: true })
  }

  return json({ error: 'unknown op' }, 400)
}
