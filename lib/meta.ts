// One place for the things every page's share card needs to agree on.
//
// The canonical host matters more than it looks. Without a metadataBase Next
// leaves og:url relative ("/tim", which is not a URL) and resolves og:image
// against whatever hostname served the request — which on Vercel is the
// per-deployment address, e.g.
//
//   https://leaving-this-here-k2z39j8io-…vercel.app/tim/opengraph-image
//
// Those addresses are superseded every deploy. A card shared today pointed at
// one that no longer answers: an older deployment host in this project already
// returns 401. So share images silently rotted, and every shared link leaked a
// vercel.app address instead of the brand.

/** Canonical origin. Every absolute URL in metadata resolves against this. */
export const SITE_URL = 'https://www.yourbulletin.com'

export const SITE_NAME = 'Bulletin'

/** What Bulletin is, in one line. Used for the site description and the
 *  homepage's share card. */
export const SITE_DESCRIPTION = 'Everything you save, finally somewhere.'

/** Search engines cut descriptions around 155-160 characters, and a share card
 *  clips sooner still. Cut on a word so it ends as language rather than
 *  mid-syllable, and only add the ellipsis when something was actually removed. */
export function clampDescription(text: string | null | undefined, max = 155): string | null {
  if (!text) return null
  // A bio written on two lines is two statements. Collapsing the break to a
  // space runs them together ("…founders factory Exited founder of…"); the
  // middot keeps them as the separate things they were written as.
  const clean = text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' · ')
    .replace(/[ \t]+/g, ' ')
    .trim()
  if (!clean) return null
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\s]+$/, '')}…`
}
