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

// Card types where the rendered page IS the draw — a homepage / landing / brand
// site — so the hero SCREENSHOT leads and the og/logo is the fallback. Every
// other type is content whose og leads. See cardImageCandidates for the why.
const SCREENSHOT_FIRST_CARD_TYPES = new Set(['screenshot', 'lth', 'profile'])

/**
 * Ordered list of card-image candidates, best first, tried in sequence by
 * CardThumb (it walks to the next candidate on each <img> error).
 *
 * SOURCE ORDER IS CARD-TYPE-AWARE, modelled on mymind (validated across two
 * independent link batches — see the note below):
 *   • Content pages (article, product, book, tweet, social composite, …) → OG
 *     FIRST. The og IS the content: article hero, product shot, book cover,
 *     tweet media. A screenshot of the page (nav chrome, paywalls, consent
 *     walls) is strictly worse.
 *   • Homepages / landing / brand sites (screenshot, lth, profile) → SCREENSHOT
 *     FIRST. Here the *rendered page itself* is the beautiful thing; mymind shows
 *     the site's hero, not its og share-card (it chose the screenshot over the og
 *     for Plannotator, Ploy, OSSCAR, War on the Rocks, Andy Stumpf, …). The og
 *     is the fallback for when the screenshot is missing/blank — a Vollebak-style
 *     capture failure drops to the og/brand mark automatically via the chain.
 *
 * Either way the OTHER source is the fallback, so a broken/404 og (thequantum-
 * insider) — or a blank screenshot — drops to the other before the domain plate.
 * Logo/avatar ogs are dropped when a screenshot exists (a cropped wordmark
 * renders as garbage).
 *
 * NOT a richness/colorfulness/entropy metric. We built and tested those against
 * mymind and they did NOT reproduce its picks (a vivid flat share-card scores
 * "rich"; a desaturated photo scores "flat"). mymind's homepage rule is simply
 * "show the site," with the rare designed-og exception (Ribbon's gradient, Triple
 * Aught's logo) left to a manual per-card override — not a heuristic.
 *
 * Deterministic at render time — no backfill. `screenshot_url` may be ''
 * (sentinel: none) and is treated as absent.
 */
export function cardImageCandidates(
  url: string,
  imageUrl: string | null | undefined,
  screenshotUrl: string | null | undefined,
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
  // Homepages / landing / brand sites lead with the rendered hero screenshot;
  // content leads with its og. The other source is the fallback either way.
  // De-duped (og === ss can happen for content platforms sentinel'd to the same
  // source) and null-stripped.
  const ordered =
    cardType && SCREENSHOT_FIRST_CARD_TYPES.has(cardType) ? [ss, og] : [og, ss]
  return [...new Set(ordered.filter((s): s is string => !!s))]
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
