// Shared pieces for the generated share cards.
//
// Satori (what ImageResponse renders with) reads ttf, otf and woff — but NOT
// woff2, which is the only format app/fonts holds. So the brand serif can't be
// loaded from disk. Cardo is on Google Fonts, which serves ttf to any client
// that doesn't advertise woff2 support, so it's fetched from there instead.
//
// The css is parsed rather than pinning the versioned file url: that url
// carries a version segment (…/cardo/v21/…) that Google rotates, and a pinned
// one would eventually 404 into an un-branded card that nobody would notice.

const CARDO_CSS = 'https://fonts.googleapis.com/css2?family=Cardo:wght@400;700'

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: 'normal' }

// Module scope, so a warm lambda pays the two fetches once rather than per card.
let cached: OgFont[] | null = null

/** Cardo 400 + 700, or an empty list — a card in the fallback font is worse
 *  than one in Cardo, and far better than no card at all. */
export async function loadCardo(): Promise<OgFont[]> {
  if (cached) return cached
  try {
    // A bare UA string: Google decides the format from it, and answers with
    // truetype for anything that doesn't advertise woff2. Deliberately not an
    // ancient one — MSIE 6 gets a single weight at an extension-less endpoint
    // (/l/font?kit=…), which matches nothing below and silently loses Cardo.
    const css = await fetch(CARDO_CSS, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    }).then((r) => (r.ok ? r.text() : ''))

    const urls = [...css.matchAll(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1])
    if (urls.length < 2) return []

    const [regular, bold] = await Promise.all(
      urls.slice(0, 2).map((u) => fetch(u).then((r) => r.arrayBuffer()))
    )
    cached = [
      { name: 'Cardo', data: regular, weight: 400, style: 'normal' },
      { name: 'Cardo', data: bold, weight: 700, style: 'normal' },
    ]
    return cached
  } catch {
    return []
  }
}

/** The card's ground. Paper, and only paper.
 *
 *  The page's dot grid is deliberately absent: Satori doesn't tile a gradient
 *  via background-size, so it drew nothing, and the alternative — ~740 divs,
 *  one per dot — is a lot of render for a #d9d9d9 texture that disappears at
 *  the size these are actually looked at. The wordmark and Cardo carry the
 *  brand here. */
export const PAPER = {
  backgroundColor: '#ffffff',
} as const

export const INK = '#2b2b2b'

/** The wordmark, bundled with the route rather than fetched from the site — a
 *  card should not need the site to be reachable in order to draw its own logo.
 *  One copy here, used by both cards. */
export async function loadLogo(): Promise<ArrayBuffer | null> {
  try {
    return await fetch(new URL('./bulletin-logo.png', import.meta.url)).then((r) => r.arrayBuffer())
  } catch {
    return null
  }
}
