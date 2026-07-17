import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/extension/suggest-list-name
//
// Suggests short, "why you saved it" names for NEW lists to drop a freshly saved
// bullet into. Lists are about purpose/theme (a reason to collect), not the
// page's topic — so we steer Claude away from tag-like nouns ("technology",
// "ai") and toward curatorial names ("Design Inspo", "Weekend Reads").
//
// Returns { names: string[] } — up to SUGGESTION_COUNT proposals, already
// filtered against the lists the user owns (the toast renders those separately
// under "Your Lists"; a suggestion that duplicates one is noise). `name` mirrors
// names[0] for older callers.
//
// Called by the Chrome extension after a save, off the critical path: the toast
// shows immediately and only paints the suggestions if/when this returns. Auth +
// CORS mirror the other extension routes (bearer token).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

// How many proposals to ask for. The toast shows them as a "Suggested for this
// page" group; more than three turns a quiet offer into a decision.
const SUGGESTION_COUNT = 3

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
    // Not configured — degrade gracefully, the UI just won't show suggestions.
    return json({ names: [], name: null })
  }

  // The user's own lists, so we can both steer Claude away from re-proposing
  // them and hard-filter anything it proposes anyway. RLS scopes this to them.
  const { data: ownLists } = await supabase
    .from('lists')
    .select('name')
    .eq('user_id', user.id)
  const ownNames = (ownLists || [])
    .map((l: { name: string | null }) => (l.name || '').trim())
    .filter(Boolean)
  const ownSet = new Set(ownNames.map((n) => n.toLowerCase()))

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
    `Suggest ${SUGGESTION_COUNT} different list names a person might file this ` +
    `saved link under:\n\n` +
    `${context}\n\n` +
    (ownNames.length
      ? `They already have these lists, so do NOT suggest these or close ` +
        `variants of them — propose collections they don't have yet:\n` +
        `${ownNames.map((n) => `- ${n}`).join('\n')}\n\n`
      : '') +
    `Reply with only the ${SUGGESTION_COUNT} names, one per line: each 1-3 ` +
    `words, Title Case, no quotes, no numbering, no punctuation, no explanation.`

  let names: string[] = []
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
        max_tokens: 64,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
    if (res.ok) {
      const data = await res.json()
      const raw = data?.content?.[0]?.text
      if (typeof raw === 'string') {
        const seen = new Set<string>()
        names = raw
          .trim()
          .split('\n')
          // Strip list markers ("1. ", "- "), stray quotes/punctuation, and cap
          // the length — Haiku mostly complies, but not always.
          .map((line) =>
            line
              .trim()
              .replace(/^[-*\d.)\s]+/, '')
              .replace(/^["'“”]+|["'“”.]+$/g, '')
              .trim()
              .slice(0, 40)
          )
          .filter((n) => {
            const k = n.toLowerCase()
            if (!n || ownSet.has(k) || seen.has(k)) return false
            seen.add(k)
            return true
          })
          .slice(0, SUGGESTION_COUNT)
      }
    }
  } catch {
    // Suggestions are a nicety — never surface an error to the toast.
  }

  return json({ names, name: names[0] || null })
}
