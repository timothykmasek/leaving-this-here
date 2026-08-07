import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { uniqueSlug } from '@/lib/slug'
import { embed, bookmarkToEmbedText } from '@/lib/embed'
import { type Vec, parseVec, cosine, centroid } from '@/lib/vec'

// Lists API for the Chrome extension.
//
//   GET  /api/extension/lists           → { lists: [{ id, name, slug }] }
//     ?bookmark_id=… also returns { member_of: [listId] } — which of those lists
//     already hold that bullet, so the toast can show its checkmarks on a
//     re-save instead of claiming the bullet is filed nowhere.
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

type ListRow = { id: string; name: string; slug: string }

export async function GET(request: NextRequest) {
  const a = await authed(request)
  if ('error' in a) return a.error

  const { data, error } = await a.supabase
    .from('lists')
    .select('id, name, slug')
    .eq('user_id', a.userId)
    .order('created_at', { ascending: false })
  if (error) return json({ error: error.message }, 400)
  // DB order is newest-first; that's the fallback order for anything ranking
  // can't score (empty lists, or when there's no target vector).
  let lists: ListRow[] = data || []

  const bookmarkId = new URL(request.url).searchParams.get('bookmark_id')
  if (!bookmarkId || lists.length === 0) return json({ lists, member_of: [] })

  // Constrained to the caller's own list ids, so this can't be used to probe
  // which of someone else's lists a bullet sits in.
  const { data: mem, error: memErr } = await a.supabase
    .from('list_bookmarks')
    .select('list_id')
    .eq('bookmark_id', bookmarkId)
    .in('list_id', lists.map((l) => l.id))
  if (memErr) return json({ error: memErr.message }, 400)
  const memberOf = (mem || []).map((m) => m.list_id)

  // Rank the existing lists by how well this bullet fits each one's theme, so
  // the toast leads with "this belongs here" instead of newest-first. Best
  // effort: any miss (no vector, no embedded members) leaves DB order intact.
  if (lists.length >= 2) {
    try {
      lists = await rankListsForBookmark(a.supabase, a.userId, bookmarkId, lists)
    } catch {
      // Ranking is a nicety — never fail the list card over it.
    }
  }

  return json({ lists, member_of: memberOf })
}

// Reorder `lists` so the ones whose theme best matches this bullet come first.
// Signal mirrors the list-page ambient shelf, inverted: instead of ranking
// bullets against one list's centroid, we rank each list's centroid against one
// bullet. Lists with no embedded members can't be scored and keep DB order,
// appended after the ranked ones.
async function rankListsForBookmark(
  supabase: SupabaseClient,
  userId: string,
  bookmarkId: string,
  lists: ListRow[]
): Promise<ListRow[]> {
  // Target vector for the bullet. Prefer its stored embedding (re-saves,
  // backfilled items); on a fresh save that column is still null — embed-on-save
  // is fire-and-forget — so embed the text on demand rather than degrade to date
  // order in the common case. Same 'document' space as the stored vectors.
  const { data: bm } = await supabase
    .from('bookmarks')
    .select('title, description, url, embedding')
    .eq('id', bookmarkId)
    .single()
  if (!bm) return lists

  let target: Vec | null = parseVec(bm.embedding)
  if (!target) {
    const text = bookmarkToEmbedText({
      title: bm.title,
      description: bm.description,
      url: bm.url,
    })
    if (!text.trim()) return lists
    const [v] = await embed([text], 'document')
    target = v
  }
  if (!target || !target.length) return lists

  // All member embeddings for these lists, one query, grouped into per-list
  // vector bags. Paginate — PostgREST caps at 1000 rows/req.
  const listIds = lists.map((l) => l.id)
  const vecsByList = new Map<string, Vec[]>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('list_bookmarks')
      .select('list_id, bookmarks(embedding)')
      .in('list_id', listIds)
      .range(from, from + 999)
    if (error) throw error
    for (const r of data || []) {
      const v = parseVec((r as any).bookmarks?.embedding)
      if (!v || !v.length) continue
      const bag = vecsByList.get((r as any).list_id) || []
      bag.push(v)
      vecsByList.set((r as any).list_id, bag)
    }
    if (!data || data.length < 1000) break
  }

  // Score each list by cosine(bullet, list centroid). No embedded members → no
  // score; those fall through to DB order behind everything ranked.
  const scored: { list: ListRow; score: number }[] = []
  const unscored: ListRow[] = []
  for (const l of lists) {
    const c = centroid(vecsByList.get(l.id) || [])
    if (!c) {
      unscored.push(l)
      continue
    }
    scored.push({ list: l, score: cosine(target, c) })
  }
  scored.sort((x, y) => y.score - x.score)

  return [...scored.map((s) => s.list), ...unscored]
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
