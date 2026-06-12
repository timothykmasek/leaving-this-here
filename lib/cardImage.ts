// Screenshot-first card visuals.
//
// Screenshots give every card the same "window onto the actual site" look, so
// they win by default. The exception is content platforms, where the og:image
// IS the content (video thumbnail, episode art, tweet media) — a screenshot of
// a watch/player page (chrome, sidebars, consent walls) is strictly worse.

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

/**
 * Pick the card image: screenshot-first everywhere, og-first on content
 * platforms, falling back to whichever one the first choice lacks.
 * `screenshot_url` can be '' (sentinel: no screenshot needed/possible) — treat
 * it as absent.
 */
export function pickCardImage(
  url: string,
  imageUrl: string | null | undefined,
  screenshotUrl: string | null | undefined,
): string | null {
  const og = imageUrl || null
  const ss = screenshotUrl || null
  return prefersOgImage(url) ? og || ss : ss || og
}
