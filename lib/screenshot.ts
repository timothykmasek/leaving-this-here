// Screenshot capture + persistence.
//
// The problem this solves: cards used to embed a LIVE screenshotone URL in
// screenshot_url and re-request a fresh capture on every page view. On a full
// grid (~768 screenshot cards) that fired hundreds of simultaneous requests at
// a shared demo key, which rate-limited and returned JSON errors — the browser
// blocked them (net::ERR_BLOCKED_BY_ORB) and the cards collapsed to the
// wordmark-glyph fallback.
//
// The fix (mymind's model): capture each screenshot ONCE, store the bytes in
// Supabase Storage, and serve the permanent CDN URL. No per-view API calls, no
// rate limiting.

import type { SupabaseClient } from '@supabase/supabase-js'

export const SCREENSHOT_BUCKET = 'card-images'

const SCREENSHOTONE_BASE = 'https://api.screenshotone.com/take'

// screenshotone sometimes serves its OWN errors as a rendered image (HTTP 200,
// content-type image/webp) instead of JSON — e.g. a blank white webp with the
// text "local_rate_limited". Those pass the res.ok + image/* guard and get
// stored as if they were real captures, leaving the card permanently blank.
// They're tiny: a real 1280×900 capture is 11KB+ even for a near-empty page
// (example.com is 11.3KB); the error placeholders are all under ~7KB. Reject
// anything below this floor so it's treated as a (retryable) failure instead.
const MIN_SCREENSHOT_BYTES = 8000

/**
 * Build a screenshotone capture URL. Reads the access key from the
 * SCREENSHOTONE_ACCESS_KEY env var — never hardcode it.
 *
 * `fresh: true` forces `cache: false` so ScreenshotOne re-renders the page
 * instead of serving its 30-day-cached copy. Required for deliberate
 * re-captures (fixing a stale/bad-crop shot) — with the default `cache: true`,
 * a re-capture within the TTL would just hand back the same stale image.
 */
export function screenshotApiUrl(url: string, opts: { fresh?: boolean } = {}): string {
  const key = process.env.SCREENSHOTONE_ACCESS_KEY
  if (!key) throw new Error('SCREENSHOTONE_ACCESS_KEY is not set')
  const params = new URLSearchParams({
    access_key: key,
    url,
    viewport_width: '1280',
    viewport_height: '900',
    format: 'webp',
    image_quality: '90',
    block_ads: 'true',
    block_cookie_banners: 'true',
    block_chats: 'true',
    // Freeze animations/carousels so we never capture a mid-transition frame,
    // and wait for the network to settle so lazy-loaded hero images have
    // painted before the shot — both raise capture reliability on heavy
    // marketing sites (the class that was cropping wrong).
    reduced_motion: 'true',
    wait_until: 'networkidle2',
    delay: '2',
    cache: opts.fresh ? 'false' : 'true',
    cache_ttl: '2592000',
    // Many live sites bot-block or return non-2xx to the crawler but still
    // render fine — capture them anyway instead of failing.
    ignore_host_errors: 'true',
  })
  return `${SCREENSHOTONE_BASE}?${params.toString()}`
}

/** True if a screenshot_url already points at our persisted Supabase Storage copy. */
export function isPersistedScreenshot(screenshotUrl: string | null | undefined): boolean {
  if (!screenshotUrl) return false
  return screenshotUrl.includes(`/storage/v1/object/public/${SCREENSHOT_BUCKET}/`)
}

/** Create the storage bucket if it doesn't already exist (idempotent). */
export async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.storage.createBucket(SCREENSHOT_BUCKET, {
    public: true,
    fileSizeLimit: '5MB',
  })
  // "already exists" is fine; anything else bubbles up.
  if (error && !/already exists/i.test(error.message)) {
    throw new Error(`createBucket failed: ${error.message}`)
  }
}

export interface CaptureResult {
  publicUrl: string | null
  error: string | null
}

// Hosts whose image URLs carry expiring signatures — hotlinked cards silently
// rot when the signature lapses (Instagram/Facebook CDN: weeks; LinkedIn
// media: days). Images from these hosts get copied into our bucket at save
// time. Stable public CDNs (pbs.twimg.com, ytimg, …) stay hotlinked.
const ROT_PRONE_IMAGE_HOSTS = ['cdninstagram.com', 'fbcdn.net', 'licdn.com']

/** True when `imageUrl` is served with an expiring signature and must be persisted. */
export function isRotProneImageUrl(imageUrl: string | null | undefined): boolean {
  if (!imageUrl) return false
  try {
    const host = new URL(imageUrl).hostname
    return ROT_PRONE_IMAGE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

/**
 * Copy a remote card image into our bucket as `og/<bookmarkId>.<ext>` (its own
 * namespace — `<bookmarkId>.<ext>` at the root belongs to screenshots) and
 * return the permanent public URL. The signed source URL is fresh at save time,
 * so a plain server-side fetch works — no cookies needed, the signature IS the
 * access grant.
 */
export async function persistCardImage(
  supabase: SupabaseClient,
  bookmarkId: string,
  imageUrl: string,
): Promise<CaptureResult> {
  let res: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    clearTimeout(timeout)
  } catch (err) {
    return { publicUrl: null, error: `fetch failed: ${String(err)}` }
  }
  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !contentType.startsWith('image/')) {
    return { publicUrl: null, error: `HTTP ${res.status} / ${contentType}` }
  }
  const bytes = new Uint8Array(await res.arrayBuffer())
  // Same sanity bounds as client shots: no empty placeholders, no monsters.
  if (bytes.byteLength < 500 || bytes.byteLength > 5_000_000) {
    return { publicUrl: null, error: `implausible size ${bytes.byteLength}B` }
  }
  const ext = /png/.test(contentType) ? 'png' : /webp/.test(contentType) ? 'webp' : 'jpg'
  const path = `og/${bookmarkId}.${ext}`
  try {
    await ensureBucket(supabase)
  } catch {
    /* bucket exists in practice; upload below surfaces real failures */
  }
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, { contentType, upsert: true })
  if (error) return { publicUrl: null, error: `upload failed: ${error.message}` }
  const { data } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

/**
 * Upload already-captured image bytes to Supabase Storage as
 * `<bookmarkId>.<ext>` and return the public CDN URL. Used for client-side
 * captures (the extension's chrome.tabs.captureVisibleTab) — the screenshot was
 * taken in the user's own browser (bypassing datacenter-IP blocks), so here we
 * only need to store the bytes, not capture them.
 */
export async function storeImageBytes(
  supabase: SupabaseClient,
  bookmarkId: string,
  bytes: Uint8Array,
  contentType = 'image/jpeg',
): Promise<CaptureResult> {
  const ext = /png/.test(contentType) ? 'png' : /webp/.test(contentType) ? 'webp' : 'jpg'
  const path = `${bookmarkId}.${ext}`
  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, { contentType, upsert: true })
  if (error) return { publicUrl: null, error: `upload failed: ${error.message}` }
  const { data } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}

/**
 * Capture a screenshot of `url` and upload it to Supabase Storage as
 * `<bookmarkId>.webp`. Returns the public CDN URL, or an error string if the
 * capture failed (dead domain, blocked, rate-limited, etc.).
 */
export async function captureAndStore(
  supabase: SupabaseClient,
  bookmarkId: string,
  url: string,
  opts: { fresh?: boolean } = {},
): Promise<CaptureResult> {
  let res: Response
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    res = await fetch(screenshotApiUrl(url, opts), { signal: controller.signal })
    clearTimeout(timeout)
  } catch (err) {
    return { publicUrl: null, error: `fetch failed: ${String(err)}` }
  }

  const contentType = res.headers.get('content-type') || ''
  if (!res.ok || !contentType.startsWith('image/')) {
    // screenshotone returns JSON on failure — surface its message.
    let detail = `HTTP ${res.status}`
    try {
      const body = await res.json()
      if (body?.error_message) detail = body.error_message
    } catch {
      /* non-JSON body */
    }
    return { publicUrl: null, error: detail }
  }

  const bytes = new Uint8Array(await res.arrayBuffer())

  // Guard against error-placeholder images that slip past the checks above by
  // arriving as a valid 200 image. Two cases produce these: (a) the target site
  // 429/403s ScreenshotOne's datacenter IP and — because we pass
  // ignore_host_errors — we capture the site's OWN blank block/rate-limit page;
  // (b) ScreenshotOne renders its own error as an image. Either way the bytes are
  // tiny. The caller distinguishes this "blank capture" from a genuine
  // ScreenshotOne rate-limit (which is retryable): a blank means the host blocks
  // datacenter capture, so after one retry it's sentinel'd out of the queue
  // rather than retried forever. Deliberately does NOT say "limit" so it isn't
  // mistaken for the rate-limit path.
  if (bytes.byteLength < MIN_SCREENSHOT_BYTES) {
    return {
      publicUrl: null,
      error: `blank capture (${bytes.byteLength}B < ${MIN_SCREENSHOT_BYTES}B) — host likely blocks datacenter screenshots`,
    }
  }

  const path = `${bookmarkId}.webp`

  const { error: uploadError } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(path, bytes, { contentType: 'image/webp', upsert: true })

  if (uploadError) {
    return { publicUrl: null, error: `upload failed: ${uploadError.message}` }
  }

  const { data } = supabase.storage.from(SCREENSHOT_BUCKET).getPublicUrl(path)
  return { publicUrl: data.publicUrl, error: null }
}
