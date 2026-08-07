import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { embed, bookmarkToEmbedText } from '@/lib/embed'
import { type Vec, parseVec, cosine } from '@/lib/vec'

// POST /api/extension/suggest-list-name
//
// Suggests short names for NEW lists to drop a freshly saved bullet into. The
// hard part isn't wording — it's ALTITUDE. Reading one page in isolation, a model
// picks the most specific label it can ("Insurance Data" for a satellite-imagery
// insurance startup), when the person filing it was three tabs into an AI-tools
// spree and wanted "AI Tools". A single page can't tell you the zoom level the
// collector is working at — that signal lives in what ELSE they've saved.
//
// So we name the NEIGHBOURHOOD, not the page:
//   1. Find this bullet's nearest neighbours among the user's own saves.
//   2. If a tight cluster of those neighbours is still UNFILED, name that cluster
//      — the emerging collection ("AI Operations", "Founder Resources").
//   3. If there's no real neighbourhood (a genuinely novel save), fall back to
//      naming the page itself — the old behaviour, demoted to last resort.
//
// Neighbours that ALREADY sit in a list aren't our job here: /api/extension/lists
// ranks those existing lists to the top of the toast (the centroid ranker). This
// route only proposes NEW territory, so the two never fight — and we hard-filter
// anything that duplicates a list the user owns.
//
// Off the critical path: the toast shows immediately and paints suggestions if/
// when this returns. Auth + CORS mirror the other extension routes (bearer token).

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

// How many proposals to ask for. More than three turns a quiet offer into a
// decision.
const SUGGESTION_COUNT = 3

// Two thresholds, because ranking and naming tolerate noise differently. The
// existing-list ranker (other route) can be permissive — a stray neighbour only
// nudges an order. NAMING a brand-new list off a cluster can't: one off-theme
// link poisons the name ("Web Tools" bleeding into a solar set). So the cluster
// that earns a new-list suggestion must be genuinely tight AND genuinely unfiled.
const NEIGHBOUR_FLOOR = 0.45 // "related at all" — the candidate pool
const CLUSTER_FLOOR = 0.55 // "tight enough to name a shelf after"
const MIN_CLUSTER = 3 // fewer than this isn't a collection worth a list

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
    .select('title, description, url, embedding')
    .eq('id', bookmarkId)
    .single()
  if (bmErr || !bm) return json({ error: 'bookmark not found' }, 404)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Not configured — degrade gracefully, the UI just won't show suggestions.
    return json({ names: [], name: null })
  }

  // The user's own lists: both to steer the model away from re-proposing them and
  // to hard-filter anything it proposes anyway. RLS scopes this to them.
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

  // ── Try the cluster path: name the emerging collection, not the page ──
  let prompt: string | null = null
  try {
    const cluster = await unfiledCluster(supabase, user.id, bookmarkId, bm)
    if (cluster.length >= MIN_CLUSTER) {
      prompt = clusterPrompt([bm, ...cluster], ownNames)
    }
  } catch {
    // NN scan is best-effort; fall through to the single-page path below.
  }

  // ── Fallback: name the page itself. Only when there's real context to name —
  // a bare title like "EOU" just makes the model hallucinate a category. ──
  if (!prompt) {
    if (!hasNameableContext(bm)) return json({ names: [], name: null })
    prompt = singlePagePrompt(bm, host, ownNames)
  }

  const names = await callHaiku(apiKey, prompt, ownSet)
  return json({ names, name: names[0] || null })
}

// Nearest neighbours of `bm` among the user's OWN saves that are NOT yet in any
// list and sit above CLUSTER_FLOOR — i.e. the tight, unfiled cluster that would
// justify proposing a brand-new list. Empty array ⇒ no cluster (novel save, or
// its neighbours already live in lists the other route will surface).
async function unfiledCluster(
  supabase: SupabaseClient,
  userId: string,
  bookmarkId: string,
  bm: { title?: string | null; description?: string | null; url?: string | null; embedding?: unknown }
): Promise<{ title: string | null; url: string | null }[]> {
  // Target vector: stored embedding if present (re-saves, backfilled), else embed
  // the text on demand — embed-on-save is fire-and-forget, so a fresh bullet's
  // column is usually still null at this point.
  // The library scan below doesn't need the target vector, so start it now and
  // let it run concurrently with the on-demand embed — the two slow I/O ops
  // overlap instead of running back-to-back.
  const poolP = fetchLibrary(supabase, userId)

  let target: Vec | null = parseVec(bm.embedding)
  if (!target) {
    const text = bookmarkToEmbedText({
      title: bm.title,
      description: bm.description,
      url: bm.url,
    })
    if (!text.trim()) { await poolP.catch(() => {}); return [] }
    const [v] = await embed([text], 'document')
    target = v
  }
  if (!target || !target.length) { await poolP.catch(() => {}); return [] }

  const pool = await poolP

  // Rank neighbours; keep the tight ones (above the naming floor), excluding the
  // bullet itself.
  const near = pool
    .filter((r) => r.id !== bookmarkId)
    .map((r) => ({ r, s: cosine(target!, parseVec(r.embedding) || []) }))
    .filter((o) => o.s >= NEIGHBOUR_FLOOR)
    .sort((a, b) => b.s - a.s)
    .slice(0, 12)

  const tight = near.filter((o) => o.s >= CLUSTER_FLOOR)
  if (tight.length === 0) return []

  // Which of those are already filed? A filed neighbour means the other route is
  // already surfacing its list — not new territory, so drop it from the cluster.
  const ids = tight.map((o) => o.r.id)
  const { data: filed } = await supabase
    .from('list_bookmarks')
    .select('bookmark_id')
    .in('bookmark_id', ids)
  const filedSet = new Set((filed || []).map((f: any) => f.bookmark_id as string))

  return tight
    .filter((o) => !filedSet.has(o.r.id))
    .map((o) => ({ title: o.r.title, url: o.r.url }))
}

// All of the user's embedded saves, paginated (PostgREST caps at 1000/req).
// Independent of the target vector, so it runs concurrently with the on-demand
// embed rather than after it.
type LibRow = { id: string; title: string | null; url: string | null; embedding: unknown }
async function fetchLibrary(supabase: SupabaseClient, userId: string): Promise<LibRow[]> {
  let pool: LibRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, title, url, embedding')
      .eq('user_id', userId)
      .not('embedding', 'is', null)
      .range(from, from + 999)
    if (error) throw error
    pool = pool.concat((data as LibRow[]) || [])
    if (!data || data.length < 1000) break
  }
  return pool
}

// Is there enough on this page to name a list from it at all? A real description
// or a multi-word title is nameable; a bare one-word brand ("EOU", "Special") is
// not — it only produces confident nonsense.
function hasNameableContext(bm: {
  title?: string | null
  description?: string | null
}): boolean {
  const desc = (bm.description || '').trim()
  if (desc.length >= 20) return true
  const title = (bm.title || '').trim()
  return title.split(/\s+/).filter(Boolean).length >= 2
}

const REGISTER_RULES =
  `A list name is short and plain, the way a real person labels a shelf — usually ` +
  `ONE or TWO words. It can be a topic ("Cooking", "Menswear") or a purpose ` +
  `("Read Later", "Gift Ideas") — whichever a person would actually type. NEVER a ` +
  `descriptive phrase or headline.\n` +
  `Good: Cooking, Design Inspo, Read Later, Menswear, Home Office\n` +
  `Bad (wordy / headline-y): "Understanding History's Long Arcs", "Weeknight ` +
  `Dinner Wins", "Quality Over Hype", "Smart Fabric Tech"`

function ownListsBlock(ownNames: string[]): string {
  if (!ownNames.length) return ''
  return (
    `\nThis person's existing lists — match this naming style, and do NOT propose ` +
    `these or close variants (they already have them):\n` +
    `${ownNames.map((n) => `- ${n}`).join('\n')}\n`
  )
}

// Cluster path — name the collection these links form, at the altitude a person
// organises at. This is what fixes "Insurance Data" → "AI Tools".
function clusterPrompt(
  items: { title?: string | null; url?: string | null }[],
  ownNames: string[]
): string {
  const lines = items
    .map((b) => {
      let h = ''
      try {
        h = new URL(b.url || '').hostname.replace(/^www\./, '')
      } catch {}
      return `- ${b.title || h}${h ? ` (${h})` : ''}`
    })
    .join('\n')
  return (
    `On Bulletin, a list is a shelf a person collects links on.\n\n` +
    `${REGISTER_RULES}\n\n` +
    `A person keeps saving links like these:\n${lines}\n` +
    ownListsBlock(ownNames) +
    `\nName the collection they're building — the shared theme, at the altitude ` +
    `they'd actually organise at (not a label for any single link). Suggest ` +
    `${SUGGESTION_COUNT} names, one per line, Title Case, 1-2 words each, no ` +
    `quotes, no numbering, no punctuation.`
  )
}

// Fallback path — no neighbourhood, so name the page. Same plain register.
function singlePagePrompt(
  bm: { title?: string | null; description?: string | null },
  host: string,
  ownNames: string[]
): string {
  const context = [
    bm.title && `Title: ${bm.title}`,
    bm.description && `Description: ${bm.description}`,
    host && `Source: ${host}`,
  ]
    .filter(Boolean)
    .join('\n')
  return (
    `On Bulletin, a list is a shelf a person collects links on.\n\n` +
    `${REGISTER_RULES}\n` +
    ownListsBlock(ownNames) +
    `\nSuggest ${SUGGESTION_COUNT} list names a person might file this link under:\n\n` +
    `${context}\n\n` +
    `Reply with only the ${SUGGESTION_COUNT} names, one per line, Title Case, 1-2 ` +
    `words each, no quotes, no numbering, no punctuation.`
  )
}

// One Haiku call + the cleanup the model doesn't always do itself. Returns up to
// SUGGESTION_COUNT names, de-duped and filtered against the user's own lists.
async function callHaiku(
  apiKey: string,
  prompt: string,
  ownSet: Set<string>
): Promise<string[]> {
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
    if (!res.ok) return []
    const data = await res.json()
    const raw = data?.content?.[0]?.text
    if (typeof raw !== 'string') return []
    const seen = new Set<string>()
    return raw
      .trim()
      .split('\n')
      // Strip list markers ("1. ", "- "), stray quotes/punctuation, cap length.
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
  } catch {
    // Suggestions are a nicety — never surface an error to the toast.
    return []
  }
}
