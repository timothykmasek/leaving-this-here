import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  captureAndStore,
  ensureBucket,
  isPersistedScreenshot,
} from '@/lib/screenshot'
import { prefersOgImage } from '@/lib/cardImage'

// Capture screenshots ONCE and persist them to Supabase Storage, then point
// screenshot_url at the permanent CDN copy. Replaces the old model where cards
// re-requested a live screenshotone capture on every page view (which
// rate-limited at grid scale).
//
// Cards are screenshot-first (lib/cardImage.ts), so every bookmark wants a
// persisted capture — EXCEPT content platforms (YouTube, Spotify, …) that
// already have an og:image, where the og:image IS the content and wins; those
// are marked with the '' sentinel so they leave the drain queue. `lth` rows
// that capture successfully are promoted to `screenshot` so they render the
// image instead of the wordmark-glyph fallback.
//
// Requires SUPABASE_SERVICE_ROLE_KEY and SCREENSHOTONE_ACCESS_KEY in env.

// Never evaluate route module side-effects at build time.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!process.env.SCREENSHOTONE_ACCESS_KEY) {
    return NextResponse.json(
      { error: 'SCREENSHOTONE_ACCESS_KEY is not set' },
      { status: 500 },
    )
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY is not set' },
      { status: 500 },
    )
  }

  // Lazily create the admin client INSIDE the handler — creating it at module
  // top-level runs during the build's "collect page data" step, where the
  // service-role key isn't present, and throws "supabaseKey is required".
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )

  const body = await request.json().catch(() => ({}))
  const { limit = 8, offset = 0, id = null, ids = null, force = false } = body

  try {
    await ensureBucket(supabaseAdmin)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  // Single-bookmark mode (used by the live save path).
  let query = supabaseAdmin
    .from('bookmarks')
    .select('id, url, card_type, screenshot_url, image_url')

  if (id) {
    query = query.eq('id', id)
  } else if (ids && Array.isArray(ids) && ids.length) {
    // Targeted re-capture: an explicit list of ids (used with force to fix a
    // known-bad cohort). Bounded so a stray huge array can't blow the batch.
    query = query.in('id', ids.slice(0, 100))
  } else {
    // Drain-based: only rows that still need a persisted screenshot (null, or a
    // live screenshotone URL). Persisted rows point at Supabase Storage and
    // drop out of this set, so the runner can keep offset at 0 and the unfinished
    // set shrinks each pass — rate-limited rows are naturally retried next batch.
    query = query
      .or('screenshot_url.is.null,screenshot_url.ilike.*screenshotone*')
      .order('created_at', { ascending: false })
      .limit(limit)
  }

  const { data: rows, error } = await query
  if (error || !rows) {
    return NextResponse.json(
      { error: error?.message || 'query failed' },
      { status: 500 },
    )
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  const isRateLimit = (e: string | null) => !!e && /limit|429|too many/i.test(e)
  // A "blank capture" means the site returned a tiny placeholder/block page to
  // ScreenshotOne's datacenter IP (see lib/screenshot.ts). Unlike a transient
  // rate-limit, this won't fix itself on retry — server capture is permanently
  // blocked for this host — so after one retry we sentinel it out of the queue.
  const isBlank = (e: string | null) => !!e && /blank capture/i.test(e)
  // DNS-dead domains and datacenter-blocked hosts are permanent: freeze them with
  // the '' sentinel so they render the domain plate instead of retrying forever.
  // Everything else (soft bot-blocks, timeouts, transient connect errors) stays
  // retryable.
  const isPermanent = (e: string | null) => !!e && /not resolved|name_not_resolved|name not resolved/i.test(e)

  // Bounded concurrency: capture several rows at once to use the headroom under
  // screenshotone's 40/min limit (sequential left us at ~7/min). 3 in-flight ×
  // ~5s each ≈ 36/min — under the cap, with the retry below absorbing trips.
  const CONCURRENCY = 3

  let persisted = 0
  let skipped = 0
  let failed = 0
  let rateLimited = 0
  let marked = 0
  const failures: Array<{ url: string; error: string }> = []

  const processRow = async (row: any) => {
    // Normally a row that already points at a persisted Storage copy is done and
    // skipped. `force` is the deliberate re-capture path: it overwrites even a
    // good-looking persisted shot (used to fix stale/bad-crop captures, which
    // byte-size can't detect) and captures `fresh` so ScreenshotOne re-renders
    // instead of serving its cached copy.
    if (!force && isPersistedScreenshot(row.screenshot_url)) {
      skipped++
      return
    }

    // Content platforms with an og:image don't want a screenshot — the
    // og:image IS the content (cards prefer it; see lib/cardImage.ts). Mark
    // with the sentinel so the row permanently leaves the drain queue.
    if (prefersOgImage(row.url) && row.image_url) {
      await supabaseAdmin
        .from('bookmarks')
        .update({ screenshot_url: '' })
        .eq('id', row.id)
      skipped++
      return
    }

    let { publicUrl, error: capError } = await captureAndStore(
      supabaseAdmin,
      row.id,
      row.url,
      { fresh: force },
    )

    // One backoff retry if we tripped the per-minute rate limit, or if the host
    // handed back a blank/block page (it may have been a transient host 429).
    if (!publicUrl && (isRateLimit(capError) || isBlank(capError))) {
      await sleep(8000)
      ;({ publicUrl, error: capError } = await captureAndStore(
        supabaseAdmin,
        row.id,
        row.url,
        { fresh: force },
      ))
    }

    if (!publicUrl) {
      failed++
      failures.push({ url: row.url, error: capError || 'unknown' })
      if (isRateLimit(capError)) rateLimited++
      if (isPermanent(capError) || isBlank(capError)) {
        // Permanently uncapturable server-side (DNS-dead, or the host blocks the
        // datacenter bot and only ever returns a blank page). Sentinel with '' so
        // it leaves the queue and renders the domain plate — pickCardImage still
        // falls back to the og:image if one exists. A later client-side capture
        // (extension captureVisibleTab) can overwrite this with a real shot.
        await supabaseAdmin
          .from('bookmarks')
          .update({ screenshot_url: '' })
          .eq('id', row.id)
        marked++
      }
      // Otherwise: leave screenshot_url null → retryable on a later pass.
      return
    }

    const update: Record<string, any> = { screenshot_url: publicUrl }
    // A captured lth row now has a real visual — render it as a screenshot.
    if (row.card_type === 'lth') update.card_type = 'screenshot'

    const { error: updateError } = await supabaseAdmin
      .from('bookmarks')
      .update(update)
      .eq('id', row.id)

    if (updateError) {
      failed++
      failures.push({ url: row.url, error: updateError.message })
    } else {
      persisted++
    }
  }

  // Worker pool over the batch.
  const queue = [...rows]
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length) {
      const row = queue.shift()
      if (row) await processRow(row)
    }
  })
  await Promise.all(workers)

  return NextResponse.json({
    total: rows.length,
    persisted,
    skipped,
    failed,
    rateLimited,
    marked,
    failures: failures.slice(0, 10),
    // Drain-based: more work remains as long as this batch still found
    // unpersisted rows. The runner stops on sustained zero progress. Targeted
    // modes (id / ids) are one-shot — never report more.
    hasMore: !id && !ids && rows.length > 0,
  })
}
