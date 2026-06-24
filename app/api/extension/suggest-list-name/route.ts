import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/extension/suggest-list-name
//
// Suggests a short, "why you saved it" name for a NEW list to drop a freshly
// saved bullet into. Lists are about purpose/theme (a reason to collect), not the
// page's topic — so we steer Claude away from tag-like nouns ("technology",
// "ai") and toward curatorial names ("Design Inspo", "Weekend Reads").
//
// Called by the Chrome extension after a save, off the critical path: the toast
// shows immediately and only paints the ghost-text suggestion if/when this
// returns. Auth + CORS mirror the other extension routes (bearer token).

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

  const bookmarkId =
    typeof body.bookmark_id === 'string' && body.bookmark_id.trim()
      ? body.bookmark_id.trim()
      : null
  if (!bookmarkId) return json({ error: 'bookmark_id is required' }, 400)

  // RLS scopes this to the caller's own bullets.
  const { data: bm, error: bmErr } = await supabase
    .from('bookmarks')
    .select('title, description, url')
    .eq('id', bookmarkId)
    .single()
  if (bmErr || !bm) return json({ error: 'bookmark not found' }, 404)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Not configured — degrade gracefully, the UI just won't show a suggestion.
    return json({ name: null })
  }

  let host = ''
  try {
    host = new URL(bm.url).hostname.replace(/^www\./, '')
  } catch {}

  const context = [
    bm.title && `Title: ${bm.title}`,
    bm.description && `Description: ${bm.description}`,
    host && `Source: ${host}`,
  ]
    .filter(Boolean)
    .join('\n')

  const prompt =
    `On Bulletin, a list is a collection a person curates around WHY ` +
    `they saved things — a purpose, theme, mood, or project (e.g. "Design ` +
    `Inspo", "Weekend Reads", "Gift Ideas", "Recipes to Try") — NOT what the ` +
    `page is about. Avoid generic topic tags like "technology", "ai", or ` +
    `"design".\n\n` +
    `Suggest ONE list name a person might file this saved link under:\n\n` +
    `${context}\n\n` +
    `Reply with only the list name: 1-3 words, Title Case, no quotes, no ` +
    `punctuation, no explanation.`

  let name: string | null = null
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 24,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const raw = data?.content?.[0]?.text
      if (typeof raw === 'string') {
        // Take the first line, strip stray quotes/punctuation, cap the length.
        name = raw
          .trim()
          .split('\n')[0]
          .replace(/^["'“”]+|["'“”.]+$/g, '')
          .trim()
          .slice(0, 40)
        if (!name) name = null
      }
    }
  } catch {
    // Suggestion is a nicety — never surface an error to the toast.
  }

  return json({ name })
}
