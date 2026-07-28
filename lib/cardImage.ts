// OG-first card visuals.
//
// A content-bearing og:image — product hero, article art, social media, branded
// cover — is what a well-made link *wants* to show: it's curated by the site and
// framed to look good at a glance. It beats a datacenter screenshot of the page,
// which catches nav chrome, cookie/consent walls, half-loaded heroes, and the
// wrong crop. So the og:image wins whenever it's usable; the screenshot is the
// fallback for sites that only offer a bare logo (or nothing).

import { looksLikeLogoUrl } from '@/lib/cardType'

const OG_FIRST_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'vimeo.com',
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'spotify.com',
  'music.apple.com',
  'podcasts.apple.com',
  'soundcloud.com',
]

/** True when `url` is a content platform whose og:image is the content itself. */
export function prefersOgImage(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return OG_FIRST_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// Hosts that reliably serve a datacenter screenshot bot a login/permission
// wall instead of content (private docs, drives, auth pages). Screenshotting
// these only ever captures a "Sign in" / "access denied" page, so we skip the
// capture entirely — saving the ScreenshotOne credit — and let the card fall
// back to og:image or the plate.
const SKIP_SCREENSHOT_HOSTS = [
  'docs.google.com',
  'drive.google.com',
  'accounts.google.com',
  'sheets.google.com',
  'slides.google.com',
  'forms.gle',
  'login.microsoftonline.com',
]

// Transactional / auth URL paths whose screenshot is a checkout form, cart, or
// login box — never the content the saver meant. Anchored to a path SEGMENT
// (leading `/`, trailing `/` or end) so `/blog/login-tips` or `/cart-guide`
// don't match — only the actual `/login`, `/cart`, `/checkout`, `/signin`,
// `/signup` endpoints do.
const SKIP_SCREENSHOT_PATHS =
  /(^|\/)(checkout|cart|login|signin|sign-in|signup|sign-up|account\/login)(\/|$)/i

// Live third-party screenshot services whose URLs some legacy seeding wrote
// straight into image_url/screenshot_url. They render their OWN branded loading
// spinner (and a wrong, cropped capture) on every view — never our content — so
// we treat any such URL as unusable and let the card fall back to a real
// og:image / stored screenshot / plate instead. thum.io is the one that leaked
// onto featured rows; the list guards against the whole class.
const LIVE_SCREENSHOT_SERVICE_HOSTS = ['thum.io', 'image.thum.io', 's.wordpress.com', 'mini.s-shot.ru']

function isLiveScreenshotServiceUrl(u: string | null | undefined): boolean {
  if (!u) return false
  try {
    const host = new URL(u).hostname.replace(/^www\./, '')
    return LIVE_SCREENSHOT_SERVICE_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// Author-avatar URLs that WordPress/blog meta scrapers hand back as the og:image
// — a Gravatar face (or its generated `d=mm/identicon/retro` "mystery man"
// placeholder). At card size these render as a tiny centered blob, never the
// page's content (Terrenus Energy showed a blue `d=mm` gravatar for exactly this
// reason). Treated like a logo: demoted below a screenshot when one exists.
function looksLikeAvatarUrl(u: string | null | undefined): boolean {
  if (!u) return false
  try {
    const host = new URL(u).hostname.replace(/^www\./, '')
    return host === 'gravatar.com' || host.endsWith('.gravatar.com')
  } catch {
    return false
  }
}

/** True when `url` only ever yields a login-wall / checkout / cart page to a bot. */
export function shouldSkipScreenshot(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (SKIP_SCREENSHOT_HOSTS.some((d) => host === d || host.endsWith(`.${d}`))) return true
    return SKIP_SCREENSHOT_PATHS.test(u.pathname)
  } catch {
    return false
  }
}

/**
 * Ordered list of card-image candidates, best first, ready to try in sequence.
 *
 * A content-bearing og:image always leads; the screenshot follows as the
 * fallback for logo-only / imageless sites AND for the case where the og is
 * present but *broken* — a dead/404 og (thequantuminsider) should drop to the
 * screenshot we already captured rather than the domain plate. The card walks
 * this list on each <img> error (see components/CardThumb).
 *
 * This is deterministic at render time (no backfill needed) and covers every row
 * regardless of its stored card_type — a homepage classified `screenshot` at
 * save time still shows its rich og:image here.
 *
 * `cardType` is retained on the signature for callers and future per-type
 * layouts; it no longer influences which image *source* is chosen.
 * `screenshot_url` can be '' (sentinel: no screenshot needed/possible) — treated
 * as absent.
 */
export function cardImageCandidates(
  url: string,
  imageUrl: string | null | undefined,
  screenshotUrl: string | null | undefined,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  cardType?: string | null,
): string[] {
  // Strip any live third-party screenshot-service URL (e.g. thum.io) from both
  // slots first — those never resolve to our content, so they must not be picked
  // even as a fallback.
  const cleanImage = isLiveScreenshotServiceUrl(imageUrl) ? null : imageUrl
  const ss = isLiveScreenshotServiceUrl(screenshotUrl) ? null : screenshotUrl || null
  // A bare logo/wordmark og:image renders as garbage when cropped to fill the
  // card (a zoomed-in slice of the mark). When a screenshot exists to fall back
  // on, drop the logo so the screenshot wins instead. Content platforms
  // (prefersOgImage) are exempt: their "logo" is often the actual thumbnail.
  const og =
    cleanImage &&
    ss &&
    (looksLikeLogoUrl(cleanImage) || looksLikeAvatarUrl(cleanImage)) &&
    !prefersOgImage(url)
      ? null
      : cleanImage || null
  // og first, screenshot as fallback; de-duped (og === ss can happen for
  // content platforms sentinel'd to the same source) and null-stripped.
  return [...new Set([og, ss].filter((s): s is string => !!s))]
}

/**
 * The single best card image (candidates[0]). Retained for callers that render
 * one static <img> with no fallback chain (previews, the eval harness). Cards
 * that can fall back on error should use {@link cardImageCandidates} instead.
 */
export function pickCardImage(
  url: string,
  imageUrl: string | null | undefined,
  screenshotUrl: string | null | undefined,
  cardType?: string | null,
): string | null {
  return cardImageCandidates(url, imageUrl, screenshotUrl, cardType)[0] ?? null
}
