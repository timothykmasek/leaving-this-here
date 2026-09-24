import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { extractMetadata } from '@/lib/metadata'
import { classifyCardType } from '@/lib/cardType'
import { embed, bookmarkToEmbedText } from '@/lib/embed'
import { enrichKeywords } from '@/lib/enrichKeywords'
import { normalizeUrl } from '@/lib/normalizeUrl'
import {
  ensureBucket,
  storeImageBytes,
  persistCardImage,
} from '@/lib/screenshot'
import { maybeStoreImagePref } from '@/lib/cardImageJudge'
import { maybeEnrichPlace } from '@/lib/placeEnrich'
import { withProductFact } from '@/lib/productFact'
import type { SaveSource } from '@/lib/importQuota'
import { checkSaveLimit } from '@/lib/saveLimits'

// Persist a client-side screenshot (data URL from the extension's
// captureVisibleTab) to storage and point the row at it. Runs with the service
// role (storage writes), so it stays behind the bearer-authed save. Promotes an
// `lth` row to `screenshot` so the card renders the image, not the wordmark.
async function persistClientShot(bookmarkId: string, dataUrl: string, cardType: string | null) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const m = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(dataUrl)
  if (!m) return
  let bytes: Uint8Array
  try {
    bytes = new Uint8Array(Buffer.from(m[2], 'base64'))
  } catch {
    return
  }
  // Sanity bounds: ignore empty/giant payloads.
  if (bytes.length < 500 || bytes.length > 5_000_000) return
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
  try {
    await ensureBucket(admin)
    const { publicUrl } = await storeImageBytes(admin, bookmarkId, bytes, m[1])
    if (!publicUrl) return
    const update: Record<string, any> = { screenshot_url: publicUrl }
    if (cardType === 'lth') update.card_type = 'screenshot'
    await admin.from('bookmarks').update(update).eq('id', bookmarkId)
    // Now has a client screenshot + (maybe) an og. Let the vision judge decide
    // og-vs-screenshot for a contested bare link. Best-effort; no-ops otherwise.
    await maybeStoreImagePref(admin, bookmarkId)
    // A Maps link's capture is the only place its details exist — the place page
    // is bot-gated, so a server fetch only ever sees Google's boilerplate. Read
    // it here, while the bytes are in hand. No-ops for every other kind of link.
    await maybeEnrichPlace(admin, bookmarkId, bytes, m[1])
  } catch {
    // best-effort; the server screenshotone path can still backfill later
  }
}

// Copy a hotlinked card image into our bucket and repoint the row.
//
// This used to fire only for the five "rot-prone" hosts (signed IG/FB/LinkedIn/
// TikTok CDN URLs), on the reasoning that only those expire. But leaving every
// OTHER site's image hotlinked is what quietly built up 326 remote images
// across 209 hosts — and those were the slowest things on a profile by a wide
// margin, because each one costs the reader's browser a fresh DNS lookup and
// TLS handshake. Persisting only the ones that expire fixed rot and left the
// speed problem to regrow on every save.
//
// Now: anything not already in our bucket. It's post-response via waitUntil, so
// the person saving waits for none of it, and save time is unchanged.
//
// Rot was never the only reason to own the bytes. A remote og:image can also be
// replaced or deleted by whoever owns it — which is why some older cards render
// a broken frame today.
function persistRemoteImage(bookmarkId: string, imageUrl: string | null | undefined) {
  if (!imageUrl) return
  // Already ours (or a data URI) — nothing to copy.
  if (!/^https?:\/\//i.test(imageUrl) || imageUrl.includes('/card-images/')) return
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return
  waitUntil(
    (async () => {
      const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      )
      try {
        const { publicUrl } = await persistCardImage(admin, bookmarkId, imageUrl)
        if (publicUrl) {
          await admin.from('bookmarks').update({ image_url: publicUrl }).eq('id', bookmarkId)
        }
      } catch {
        // hotlink keeps working until the signature lapses; nothing to break
      }
    })(),
  )
}

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

// Which door a save came through (bookmarks.source, migration 031). New
// callers say so; older ones are recognised by how they call: the store
// extension (≤0.5.2) from a chrome-extension:// origin, the iOS app through
// Apple's networking stack (its User-Agent carries CFNetwork/Darwin).
function saveSource(request: NextRequest, body: any): SaveSource | null {
  if (body?.source === 'extension' || body?.source === 'ios' || body?.source === 'claude') return body.source
  if ((request.headers.get('origin') || '').startsWith('chrome-extension://')) return 'extension'
  if (/CFNetwork|Darwin/.test(request.headers.get('user-agent') || '')) return 'ios'
  return null
}

// Ask the server-side ScreenshotOne capture for one bullet. waitUntil keeps the
// instance alive until the request is sent.
function requestServerShot(origin: string, bookmarkId: string) {
  waitUntil(
    fetch(`${origin}/api/persist-screenshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: bookmarkId }),
    }).catch(() => {}),
  )
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

// PATCH — owner-scoped follow-ups to a save:
//   { bookmark_id, client_shot } → the out-of-band screenshot upload. The save
//     request no longer carries the capture (it would wait on the camera and
//     haul base64); the extension sends it here once the id exists.
//   { bookmark_id, no_shot: true } → the extension promised a capture
//     (shotPending on the save) but couldn't take one (saved scrolled down, a
//     popup it couldn't clear, a page Chrome won't capture). Run the server
//     ScreenshotOne fallback now instead of waiting for the nightly sweep.
//   { bookmark_id, is_private }  → RETIRED (migration 028: visibility follows
//     filing, the flag is derived). Extension builds ≤0.5.2 still send it from
//     their globe/lock pill; answer ok so their card doesn't show an error, and
//     write nothing — the trigger would overwrite it anyway.
// Token-scoped client, so RLS's owner-only policy is the authorization; a
// non-owner matches zero rows and we report that rather than pretend it stuck.
export async function PATCH(request: NextRequest) {
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !user) return json({ error: 'invalid or expired token' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }
  const bookmarkId = typeof body.bookmark_id === 'string' ? body.bookmark_id : null
  if (!bookmarkId) return json({ error: 'bookmark_id required' }, 400)

  if (typeof body.client_shot === 'string' && body.client_shot.startsWith('data:image/')) {
    // Ownership + card_type in one read (the token client's RLS scopes it).
    const { data: row, error: rowErr } = await supabase
      .from('bookmarks')
      .select('id, card_type')
      .eq('id', bookmarkId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (rowErr) return json({ error: rowErr.message }, 400)
    if (!row) return json({ error: 'bookmark not found' }, 404)
    waitUntil(persistClientShot(row.id, body.client_shot, row.card_type))
    return json({ ok: true })
  }

  if (body.no_shot === true) {
    const { data: row } = await supabase
      .from('bookmarks')
      .select('id')
      .eq('id', bookmarkId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!row) return json({ error: 'bookmark not found' }, 404)
    requestServerShot(new URL(request.url).origin, row.id)
    return json({ ok: true })
  }

  if (typeof body.is_private === 'boolean') {
    return json({ ok: true, deprecated: 'visibility follows list membership' })
  }

  return json({ error: 'client_shot required' }, 400)
}

// DELETE — undo a save (the toast's undo icon). { bookmark_id } → { ok }.
// Token-scoped client + explicit user_id match, same authorization story as
// PATCH: a non-owner's delete matches zero rows and reports not-found.
export async function DELETE(request: NextRequest) {
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
  const { data: { user }, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !user) return json({ error: 'invalid or expired token' }, 401)

  let body: any
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid json body' }, 400)
  }
  const bookmarkId = typeof body.bookmark_id === 'string' ? body.bookmark_id : null
  if (!bookmarkId) return json({ error: 'bookmark_id required' }, 400)

  const { data, error } = await supabase
    .from('bookmarks')
    .delete()
    .eq('id', bookmarkId)
    .eq('user_id', user.id)
    .select('id')
  if (error) return json({ error: error.message }, 400)
  if (!data || data.length === 0) return json({ error: 'bookmark not found' }, 404)
  return json({ ok: true })
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
  // `body.is_private` from older extension builds is ignored: a fresh bullet
  // is born unfiled, therefore private, and the database derives the flag
  // from list membership (migration 028).
  // For "save image" context-menu saves, the extension passes the image src.
  const imageOverride: string | null =
    typeof body.image_url === 'string' && body.image_url.trim()
      ? body.image_url.trim()
      : null

  // The card's title links to the saver's page — fetch the username in
  // parallel with everything below; awaited only at response time.
  const profilePromise = supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
    .then(({ data }) => data?.username ?? null, () => null)

  // Client-read og (from the extension, in the user's logged-in browser) wins
  // over the server fetch: paywalled/bot-blocked sites that 401/403 our server
  // (WSJ, Bloomberg, Gap, …) still render a real og:image + title in the user's
  // own tab. Server meta still supplies favicon, JSON-LD product/book, and the
  // raw_metadata blob for re-derivation.
  const cm = body.clientMeta && typeof body.clientMeta === 'object' ? body.clientMeta : {}
  const cmTitle = typeof cm.title === 'string' && cm.title.trim() ? cm.title.trim() : null
  const cmImage = typeof cm.image === 'string' && cm.image.trim() ? cm.image.trim() : null
  const cmDesc = typeof cm.description === 'string' && cm.description.trim() ? cm.description.trim() : null

  // 4. Enrich: fetch + parse metadata server-side. This fetch of the page was
  //    the save's whole tail latency (slow retail sites take seconds; the fetch
  //    allows 15). When the client already read a solid title + image, the
  //    response doesn't need the server's copy — give it a short budget and,
  //    if it loses, finish out-of-band below (favicon + raw_metadata update).
  //    Saves without client meta still wait: the server fetch is all they have.
  const richClient = !!(cmTitle && cmImage)
  const metaPromise = extractMetadata(url)
  let lateMeta: typeof metaPromise | null = null
  let meta: Awaited<typeof metaPromise>
  if (richClient) {
    const settled = await Promise.race([
      metaPromise,
      new Promise<null>((r) => setTimeout(() => r(null), 1500)),
    ])
    if (settled) {
      meta = settled
    } else {
      lateMeta = metaPromise
      meta = { title: null, description: null, image: null, favicon: null, raw: {}, product: null, book: null } as Awaited<typeof metaPromise>
    }
  } else {
    meta = await metaPromise
  }
  // Backfill what the stub couldn't supply once the real fetch lands. Never
  // touches title/image/card_type — the client meta owns those on this path.
  const backfillLateMeta = (bookmarkId: string) => {
    if (!lateMeta) return
    waitUntil(
      lateMeta
        .then((m) =>
          supabase
            .from('bookmarks')
            .update({ favicon_url: m.favicon, raw_metadata: withProductFact(m.raw, m.product) })
            .eq('id', bookmarkId)
        )
        .catch(() => {})
    )
  }

  // Client og BEATS the raw tab title: body.title is document.title, which
  // carries junk like "(9+) Instagram" (the tab's unread badge) and goes stale
  // on SPA navigations. The badge strip covers older extension versions too.
  const stripBadge = (t: string) => t.replace(/^\(\d+\+?\)\s*/, '').trim()
  const bodyTitle =
    typeof body.title === 'string' && stripBadge(body.title) ? stripBadge(body.title) : null
  const title = cmTitle || bodyTitle || meta.title || url
  const description = cmDesc || meta.description
  const image_url = imageOverride || cmImage || meta.image
  const favicon_url = meta.favicon
  // Classify with the RESOLVED image so client-og pages route as article/composite
  // (og-first) instead of falling to the lth/screenshot fallback.
  const card_type = classifyCardType(url, { ...meta, image: image_url, title })

  // Normalized dedupe key (www/trailing-slash/tracking-param variants collapse
  // to one). The stored `url` stays exactly what the user saved.
  const url_key = normalizeUrl(url)

  // Refresh an existing bullet in place — the user's "re-save = refresh this
  // card" gesture: overwrite metadata, re-embed, re-capture, while preserving
  // note, list membership, and created_at. Deliberately overwrites a
  // hand-edited title: an explicit re-save says "take the page as it is now".
  // Used for both exact re-saves and near-dupes (same url_key, different url).
  const refreshExisting = async (existingId: string) => {
    const { data: refreshed, error: refreshErr } = await supabase
      .from('bookmarks')
      .update({ title, description, image_url, favicon_url, card_type, raw_metadata: withProductFact(meta.raw, meta.product), url_key })
      .eq('id', existingId)
      .select('id, title, image_url, favicon_url, is_private')
      .single()
    if (refreshErr || !refreshed) {
      return json({ error: 'already saved', alreadySaved: true }, 409)
    }
    // Text changed → the old embedding is stale. Re-embed out-of-band,
    // mirroring the insert path; the nightly backfill only covers NULLs, so
    // clear it first — a frozen instance then heals instead of drifting.
    // Text changed → both the old embedding and the old keywords are stale.
    // Clear the embedding first (a frozen instance then heals via the nightly
    // backfill), then regenerate keywords + re-embed out-of-band.
    await supabase.from('bookmarks').update({ embedding: null as any }).eq('id', refreshed.id)
    void (async () => {
      try {
        const keywords = await enrichKeywords({ title, description, url })
        const refreshEmbedText = bookmarkToEmbedText({ title, description, url, keywords })
        if (!refreshEmbedText.trim()) return
        const [vector] = await embed([refreshEmbedText], 'document')
        const vectorLiteral = `[${vector.join(',')}]`
        await supabase
          .from('bookmarks')
          .update({ keywords, embedding: vectorLiteral as any })
          .eq('id', refreshed.id)
      } catch {
        // nightly backfill sweeps embedding IS NULL
      }
    })()
    const dupShot =
      typeof body.clientShot === 'string' && body.clientShot.startsWith('data:image/')
        ? body.clientShot
        : null
    if (dupShot) waitUntil(persistClientShot(refreshed.id, dupShot, card_type))
    persistRemoteImage(refreshed.id, image_url)
    backfillLateMeta(refreshed.id)
    return json({ bookmark: refreshed, refreshed: true, username: await profilePromise })
  }

  // Near-dupe / exact re-save guard: if this user already has a bullet whose
  // url normalizes to the same key, refresh it instead of spawning a twin card.
  const { data: preExisting } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', user.id)
    .eq('url_key', url_key)
    .limit(1)
    .maybeSingle()
  if (preExisting) return refreshExisting(preExisting.id)

  // Everyday save limits (lib/saveLimits) — checked only for a NEW bullet; a
  // re-save just refreshes a card and is always allowed. The message is shown
  // as-is by the extension toast, the iOS app and Claude.
  const source = saveSource(request, body)
  const hit = await checkSaveLimit(supabase, user, source)
  if (hit) return json({ error: hit.message, limitReached: true, limit: hit.limit }, 429)

  // 5. Insert (tags removed — bullets are organized into lists and found via
  //    semantic search, no auto-tagging step)
  const { data: inserted, error: insertErr } = await supabase
    .from('bookmarks')
    .insert({
      user_id: user.id,
      url,
      url_key,
      title,
      description,
      image_url,
      favicon_url,
      note,
      card_type,
      raw_metadata: meta.raw,
      source,
    })
    .select('id, title, image_url, favicon_url, is_private')
    .single()

  if (insertErr) {
    // Backstop for a race: the exact-url unique index (migration 011) still
    // fires 23505 if two saves land at once between the pre-check and insert.
    if ((insertErr as any).code === '23505') {
      const { data: existing } = await supabase
        .from('bookmarks')
        .select('id')
        .eq('user_id', user.id)
        .eq('url', url)
        .maybeSingle()
      if (!existing) {
        return json({ error: 'already saved', alreadySaved: true }, 409)
      }
      return refreshExisting(existing.id)
    }
    return json({ error: insertErr.message }, 400)
  }

  // 7. Embed out-of-band so the response returns the instant the row exists —
  //    the extension toast was waiting on this whole chain, and the embed adds
  //    a full Voyage round-trip the user doesn't need to see. Best-effort and
  //    non-fatal: if this serverless instance is frozen after responding, the
  //    embedding is simply absent until /api/backfill-embeddings fills it in.
  void (async () => {
    try {
      // Embed-only English keywords so cross-language / synonym queries reach
      // this row; folded into the embedded text and stored alongside it.
      const keywords = await enrichKeywords({ title, description, url })
      const embedText = bookmarkToEmbedText({ title, description, url, keywords })
      if (!embedText.trim()) return
      const [vector] = await embed([embedText], 'document')
      // pgvector expects the string-literal format `[0.1, 0.2, ...]`.
      const vectorLiteral = `[${vector.join(',')}]`
      await supabase
        .from('bookmarks')
        .update({ keywords, embedding: vectorLiteral as any })
        .eq('id', inserted.id)
    } catch {
      // embedding can be backfilled later; don't fail the save
    }
  })()

  // Screenshot. If the extension captured the user's own tab (clientShot), store
  // that — it bypasses the datacenter-IP block that defeats server screenshots
  // on paywalled/bot-blocked sites. Otherwise fall back to the server
  // screenshotone capture via persist-screenshots (which skips content platforms
  // that already have an og:image).
  // Rot-prone hotlinks (signed IG/FB/LinkedIn CDN URLs) get a permanent copy.
  persistRemoteImage(inserted.id, image_url)

  const clientShot =
    typeof body.clientShot === 'string' && body.clientShot.startsWith('data:image/')
      ? body.clientShot
      : null
  // `shotPending`: the extension (0.6.2+) is capturing the tab and will send it
  // out-of-band via PATCH once it has this id. Don't also buy a ScreenshotOne
  // capture: firing one here is what raced the client shot — ScreenshotOne
  // landed seconds later and overwrote the better image, and we paid for it.
  // If the capture fails, the extension PATCHes { no_shot } and we run the
  // fallback then; if it never reports back, the nightly sweep covers it.
  const shotPending = body.shotPending === true
  if (clientShot) {
    waitUntil(persistClientShot(inserted.id, clientShot, card_type))
  } else if (!shotPending) {
    requestServerShot(new URL(request.url).origin, inserted.id)
  }

  backfillLateMeta(inserted.id)

  return json({ ok: true, bookmark: inserted, username: await profilePromise })
}
