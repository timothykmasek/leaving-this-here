import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

// POST /api/extension/tags
//
// Update the tags on a bookmark the user already saved — used by the Chrome
// extension's on-page toast, where you can add/remove tags right after saving
// (mymind-style). Bearer-authenticated exactly like /api/extension/save, and
// RLS-scoped so a user can only touch their own rows.
//
// Body: { id: string, tags: string[] }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// Normalize a user-supplied tag list: trim, drop empties, de-dupe
// case-insensitively (keeping first spelling), and cap length/count so a
// runaway client can't bloat the row.
function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const tag = raw.trim().slice(0, 40)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''
  if (!token) return json({ error: 'missing bearer token' }, 401)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser(token)
  if (userErr || !user) return json({ error: 'invalid or expired token' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  if (!id) return json({ error: 'a bookmark id is required' }, 400)
  const tags = cleanTags(body.tags)

  // Update tags. RLS scopes this to the caller's own rows; `.select()` returns
  // empty if the id isn't theirs (or doesn't exist).
  const { data: updated, error: updateErr } = await supabase
    .from('bookmarks')
    .update({ tags })
    .eq('id', id)
    .select('id, title, description, url, tags')
    .maybeSingle()

  if (updateErr) return json({ error: updateErr.message }, 400)
  if (!updated) return json({ error: 'not found' }, 404)

  // Re-embed so search reflects the edited tags (best effort — non-fatal).
  try {
    const text = bookmarkToEmbedText({
      title: updated.title,
      description: updated.description,
      url: updated.url,
      tags,
    })
    if (text.trim()) {
      const [vector] = await embed([text], 'document')
      const vectorLiteral = `[${vector.join(',')}]`
      await supabase
        .from('bookmarks')
        .update({ embedding: vectorLiteral as any })
        .eq('id', id)
    }
  } catch {
    // embedding can be backfilled later; don't fail the tag update
  }

  return json({ ok: true, tags: updated.tags })
}
