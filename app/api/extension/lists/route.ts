import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { uniqueSlug } from '@/lib/slug'

// Lists API for the Chrome extension.
//
//   GET  /api/extension/lists           → { lists: [{ id, name, slug }] }
//   POST /api/extension/lists           → op-dispatched:
//     { op: 'create', name, bookmark_id? } → mints a frozen slug, publishes the
//          list, optionally adds the bullet. Returns { list, url }.
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

export async function GET(request: NextRequest) {
  const a = await authed(request)
  if ('error' in a) return a.error

  const { data, error } = await a.supabase
    .from('lists')
    .select('id, name, slug')
    .eq('user_id', a.userId)
    .order('created_at', { ascending: false })
  if (error) return json({ error: error.message }, 400)
  return json({ lists: data || [] })
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

    // Mint a slug unique among this owner's lists, retrying once if a concurrent
    // create raced us to the same slug (the (user_id, slug) unique index).
    let listRow: { id: string; name: string; slug: string } | null = null
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

    return json({ ok: true, list: listRow, url })
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
