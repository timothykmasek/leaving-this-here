// Screenshot-first card visuals.
//
// Screenshots give every card the same "window onto the actual site" look, so
// they win by default. The exception is content platforms, where the og:image
// IS the content (video thumbnail, episode art, tweet media) — a screenshot of
// a watch/player page (chrome, sidebars, consent walls) is strictly worse.

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

// card_type drives image choice when known (it's classified at save time).
// These types HAVE a designed, content-bearing image (product shot, article
// hero, social OG, repo social-card) → the og:image beats a screenshot.
const OG_FIRST_CARD_TYPES = new Set([
  'product', 'book', 'article', 'composite', 'fullbleed',
  // tweet: the captured media image IS the content; screenshot of the page
  // (chrome, replies, login nags) is strictly worse.
  'tweet',
])
// These are landing pages / profiles / no-good-image → a screenshot (the
// "window onto the site") beats the og:image (usually a bare logo).
const SCREENSHOT_FIRST_CARD_TYPES = new Set([
  'screenshot', 'profile', 'lth',
])

/**
 * Pick the card image.
 *
 * When `cardType` is known (set at save time by classifyCardType), it decides:
 * content-type cards prefer their og:image, landing/profile cards prefer the
 * screenshot. When it's absent (older rows not yet classified), fall back to the
 * domain heuristic: screenshot-first everywhere, og-first on content platforms.
 *
 * Either way we fall back to whichever source the first choice lacks.
 * `screenshot_url` can be '' (sentinel: no screenshot needed/possible) — treated
 * as absent.
 */
export function pickCardImage(
  url: string,
  imageUrl: string | null | undefined,
  screenshotUrl: string | null | undefined,
  cardType?: string | null,
): string | null {
  const ss = screenshotUrl || null
  // A bare logo/wordmark og:image renders as garbage when cropped to fill the
  // card (a zoomed-in slice of the mark). It's never the right choice when a
  // screenshot exists — so drop it here, before any card-type routing. This
  // catches rows classified before logo detection landed in classifyCardType,
  // deterministically at render time (no backfill needed). Content platforms
  // (prefersOgImage) are exempt: their "logo" is often the actual thumbnail.
  const og =
    imageUrl && ss && looksLikeLogoUrl(imageUrl) && !prefersOgImage(url)
      ? null
      : imageUrl || null
  if (cardType) {
    if (OG_FIRST_CARD_TYPES.has(cardType)) return og || ss
    if (SCREENSHOT_FIRST_CARD_TYPES.has(cardType)) return ss || og
  }
  return prefersOgImage(url) ? og || ss : ss || og
}
