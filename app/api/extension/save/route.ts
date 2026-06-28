import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { extractMetadata } from '@/lib/metadata'
import { classifyCardType } from '@/lib/cardType'
import { embed, bookmarkToEmbedText } from '@/lib/embed'

// POST /api/extension/save
//
// The save endpoint used by the Chrome extension. Unlike /api/bookmarks
// (which authenticates via the web app's session cookie), this route
// authenticates via an `Authorization: Bearer <access_token>` header — the
// Supabase session token the extension obtains through Google sign-in.
//
// It also runs the full enrichment pipeline server-side so the extension
// can stay dumb: fetch metadata, auto-tag with Claude, insert, then embed.
//
// Because it's called cross-origin from a chrome-extension:// origin, it
// answers CORS preflight and echoes permissive CORS headers (safe here —
// auth is via bearer token, not cookies).

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

export async function POST(request: NextRequest) {
  // 1. Pull the bearer token
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (!token) {
    return json({ error: 'missing bearer token' }, 401)
  }

  // 2. Build a Supabase client scoped to this user's token. RLS will apply
  //    exactly as it would for a cookie-authed request.
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

  if (userErr || !user) {
    return json({ error: 'invalid or expired token' }, 401)
  }

  // 3. Parse + validate the body
  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }

  let url: string
  try {
    url = new URL(body.url).toString()
  } catch {
    return json({ error: 'a valid url is required' }, 400)
  }

  const note: string | null =
    typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null
  // For "save image" context-menu saves, the extension passes the image src.
  const imageOverride: string | null =
    typeof body.image_url === 'string' && body.image_url.trim()
      ? body.image_url.trim()
      : null

  // 4. Enrich: fetch + parse metadata server-side
  const meta = await extractMetadata(url)

  const title = (typeof body.title === 'string' && body.title.trim()) || meta.title || url
  const description = meta.description
  const image_url = imageOverride || meta.image
  const favicon_url = meta.favicon
  // Classify at save so the card knows how to render (image routing now, and
  // type-specific templates later) — previously only the backfill job set this.
  const card_type = classifyCardType(url, meta)

  // 5. Insert (tags removed — bullets are organized into lists and found via
  //    semantic search, no auto-tagging step)
  const { data: inserted, error: insertErr } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      url,
      title,
      description,
      image_url,
      favicon_url,
      note,
      card_type,
      raw_metadata: meta.raw,
    })
    .select('id, title, image_url, favicon_url')
    .single()

  if (insertErr) {
    // Unique violation on (user_id, url) — already saved
    if ((insertErr as any).code === '23505') {
      return json({ error: 'already saved', alreadySaved: true }, 409)
    }
    return json({ error: insertErr.message }, 400)
  }

  // 7. Embed out-of-band so the response returns the instant the row exists —
  //    the extension toast was waiting on this whole chain, and the embed adds
  //    a full Voyage round-trip the user doesn't need to see. Best-effort and
  //    non-fatal: if this serverless instance is frozen after responding, the
  //    embedding is simply absent until /api/backfill-embeddings fills it in.
  const embedText = bookmarkToEmbedText({ title, description, url })
  if (embedText.trim()) {
    void (async () => {
      try {
        const [vector] = await embed([embedText], 'document')
        // pgvector expects the string-literal format `[0.1, 0.2, ...]`.
        const vectorLiteral = `[${vector.join(',')}]`
        await supabase
          .from('bookmarks')
          .update({ embedding: vectorLiteral as any })
          .eq('id', inserted.id)
      } catch {
        // embedding can be backfilled later; don't fail the save
      }
    })()
  }

  // Kick off the one-time screenshot capture (cards are screenshot-first).
  // waitUntil keeps the serverless instance alive until this request is
  // actually sent — a bare fire-and-forget can be dropped when the function
  // freezes right after responding, leaving screenshot_url null forever and
  // the card stuck on the og:image. persist-screenshots itself skips content
  // platforms that already have an og:image.
  const origin = new URL(request.url).origin
  waitUntil(
    fetch(`${origin}/api/persist-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: inserted.id }),
    }).catch(() => {}),
  )

  return json({ ok: true, bookmark: inserted })
}
