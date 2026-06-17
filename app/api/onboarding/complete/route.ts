import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServer } from '@/lib/supabase/server'
import { extractMetadata } from '@/lib/metadata'
import { embed, bookmarkToEmbedText } from '@/lib/embed'
import { uniqueSlug } from '@/lib/slug'

// POST /api/onboarding/complete — the attach step of "magic-first" onboarding.
//
// The whole flow up to here ran anonymously; this route runs once a session
// exists (cookie auth) and turns the stashed answers into a real page:
//
//   1. re-check + claim the handle  → profiles row (display name, bio, links)
//   2. Haiku writes the bio          (template fallback; finale verbatim)
//   3. first list, named from topic  → lists row (frozen slug)
//   4. URL-bearing answers           → real bookmarks through the same
//      enrichment as every other save (metadata → embed; screenshots async)
//
// Idempotent: if the user already has a profile we return it untouched, so a
// double-submit (or a returning user) can't duplicate anything.
//
// Body: { handle, answers: { topic, topic_why, rec, rec_why, finale }, socials }

const RESERVED = new Set([
  'api', 'auth', 'login', 'logout', 'signup', 'setup', 'start', 'save',
  'bookmarklet', 'privacy', 'terms', 'about', 'help', 'admin', 'settings',
  'profile', 'search', 'lists', 'list', 'extension', 'www', 'mail', 'blog',
  'static', 'assets', 'public', 'home', 'index', 'new', 'edit', 'me',
  'according', 'accordingto', 'official',
])

function titlecase(s: string): string {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

// First URL-looking thing in a free-text answer, normalized to https://.
function extractUrl(raw: string | undefined): string | null {
  if (!raw) return null
  const m = raw.match(/(https?:\/\/[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?)/i)
  if (!m) return null
  let u = m[1].replace(/[.,;)\]]+$/, '')
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u
  try {
    const parsed = new URL(u)
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

async function haiku(prompt: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
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
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const raw = data?.content?.[0]?.text
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  // Idempotency: already has a page → done, nothing to build.
  const { data: existing } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  if (existing) return NextResponse.json({ ok: true, username: existing.username })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const handle = String(body.handle || '').trim().toLowerCase()
  if (!handle || handle.length > 30 || !/^[a-z0-9-]+$/.test(handle) || RESERVED.has(handle)) {
    return NextResponse.json({ error: 'invalid handle', reason: 'invalid' }, { status: 400 })
  }

  const a = body.answers || {}
  const answers = {
    topic: typeof a.topic === 'string' ? a.topic.trim().slice(0, 200) : '',
    topic_why: typeof a.topic_why === 'string' ? a.topic_why.trim().slice(0, 500) : '',
    rec: typeof a.rec === 'string' ? a.rec.trim().slice(0, 200) : '',
    rec_why: typeof a.rec_why === 'string' ? a.rec_why.trim().slice(0, 500) : '',
    finale: typeof a.finale === 'string' ? a.finale.trim().slice(0, 140) : '',
  }

  // Fetch link content for better bio generation
  async function fetchLinkContent(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!res.ok) return null
      const text = await res.text()
      const titleMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i)
      const descMatch = text.match(/<meta\s+name="description"\s+content="([^"]+)"/i)
      const title = titleMatch?.[1]?.slice(0, 100) || null
      const desc = descMatch?.[1]?.slice(0, 200) || null
      return [title, desc].filter(Boolean).join('. ')
    } catch {
      return null
    }
  }

  // Fetch content from the recommendation link first (more important)
  let linkContext = ''
  const recUrl = extractUrl(answers.rec_why)
  if (recUrl) {
    const content = await fetchLinkContent(recUrl)
    if (content) linkContext = `About the resource: "${content}"\n`
  }
  const s = body.socials || {}
  const links: Record<string, string> = {}
  for (const k of ['twitter', 'instagram', 'linkedin', 'website']) {
    if (typeof s[k] === 'string' && s[k].trim()) links[k] = s[k].trim().slice(0, 120)
  }

  const name = titlecase(handle)

  // ── Bio: Haiku first, deterministic template as the net ─────────────
  const finale = answers.finale.replace(/^[“”]+|[“”]+$/g, '').replace(/\.+$/, '')
  let bio: string | null = null
  if (answers.topic) {
    bio = await haiku(
      `Write a 1-2 sentence bio (max 40 words) for a person's public page on ` +
        `”according to”, where people share links they vouch for. Warm, specific, ` +
        `grounded in what they actually know and recommend — never generic or cheesy. ` +
        `No exclamation marks, no hashtags. Third person but WITHOUT using their name ` +
        `or any pronouns (start with a verb or noun phrase, e.g. “Knows…”, “Collector of…”).\n\n` +
        `They know a lot about: ${answers.topic}\n` +
        (answers.rec ? `They recently recommended: ${answers.rec}\n` : '') +
        (linkContext ? linkContext : '') +
        `\nReply with only the bio text.`,
      120
    )
  }
  if (!bio) {
    const t = answers.topic && answers.topic.length <= 40 ? answers.topic.toLowerCase() : null
    bio = t
      ? `Could go on about ${t} for longer than you'd like. Saving the good stuff before it disappears, and happy to share.`
      : `Quietly collecting the corners of the internet worth keeping. Saving the good stuff before it disappears, and happy to share.`
  }
  if (finale) {
    bio = `${bio} According to ${name}, life is better with ${finale}.`
  }

  // ── Profile (the authoritative handle claim — unique index decides) ──
  const { error: profErr } = await supabase.from('profiles').insert({
    id: user.id,
    username: handle,
    display_name: name,
    bio,
    links,
  })
  if (profErr) {
    if ((profErr as any).code === '23505') {
      return NextResponse.json({ error: 'handle taken', reason: 'taken' }, { status: 409 })
    }
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  // Everything below is best-effort: the page exists; enrich what we can.

  // ── First list, named for WHY they collect (not the topic noun) ──────
  let listId: string | null = null
  if (answers.topic) {
    const suggested = await haiku(
      `On "according to", a list is a collection a person curates around WHY ` +
        `they saved things — a purpose, theme, or project (e.g. "Design Inspo", ` +
        `"Weekend Reads", "Gift Ideas") — NOT a bare topic noun.\n\n` +
        `This person knows a lot about: ${answers.topic}\n\n` +
        `Suggest ONE list name for the links they'd share about it. 1-3 words, ` +
        `Title Case, no quotes, no punctuation. Reply with only the name.`,
      24
    )
    const listName =
      (suggested && suggested.split('\n')[0].replace(/^["'“”]+|["'“”.]+$/g, '').slice(0, 40)) ||
      (answers.topic.length <= 26 ? titlecase(answers.topic) : 'My First List')
    const { data: list } = await supabase
      .from('lists')
      .insert({ user_id: user.id, name: listName, slug: uniqueSlug(listName, []) })
      .select('id')
      .single()
    listId = list?.id || null
  }

  // ── Bookmarks from URL-bearing answers ───────────────────────────────
  // topic link first, rec link second — so the recommendation is the most
  // recent save and naturally tops the profile.
  const saves: { url: string; toList: boolean }[] = []
  const topicUrl = extractUrl(answers.topic_why)
  // recUrl already extracted above for link context
  if (topicUrl) saves.push({ url: topicUrl, toList: true })
  if (recUrl && recUrl !== topicUrl) saves.push({ url: recUrl, toList: false })

  const origin = new URL(request.url).origin
  for (const save of saves) {
    try {
      const meta = await extractMetadata(save.url)
      // Blocked/empty fetches happen (Cloudflare etc.) — fall back to a
      // titlecased domain root ("casualphotophile.com" → "Casualphotophile"),
      // never the raw URL.
      let fallbackTitle = save.url
      try {
        fallbackTitle = titlecase(new URL(save.url).hostname.replace(/^www\./, '').split('.')[0])
      } catch {}
      const title = meta.title || fallbackTitle
      const { data: inserted } = await supabase
        .from('bookmarks')
        .insert({
          user_id: user.id,
          url: save.url,
          title,
          description: meta.description,
          image_url: meta.image,
          favicon_url: meta.favicon,
          raw_metadata: meta.raw,
        })
        .select('id')
        .single()
      if (!inserted) continue

      if (save.toList && listId) {
        await supabase
          .from('list_bookmarks')
          .insert({ list_id: listId, bookmark_id: inserted.id })
      }

      // Same out-of-band enrichment as every other save path.
      const embedText = bookmarkToEmbedText({ title, description: meta.description, url: save.url })
      if (embedText.trim()) {
        void (async () => {
          try {
            const [vector] = await embed([embedText], 'document')
            await supabase
              .from('bookmarks')
              .update({ embedding: `[${vector.join(',')}]` as any })
              .eq('id', inserted.id)
          } catch {}
        })()
      }
      void fetch(`${origin}/api/persist-screenshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: inserted.id }),
      }).catch(() => {})
    } catch {
      // a bad link shouldn't sink the onboarding — the page still publishes
    }
  }

  return NextResponse.json({ ok: true, username: handle })
}
