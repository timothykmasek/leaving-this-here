// The 8 Bulletin card categories (Tim, 2026-08-15) and how a bullet resolves to
// one. Resolution happens at RENDER time — no DB migration, no classifier
// rewrite — so it works on every existing row and stays reversible:
//   1. Strong URL/domain signals win first (a youtube link is Video even if the
//      stored card_type says 'article' — the classifier is noisy, see the audit).
//   2. Otherwise fall back to the stored card_type.
//   3. Otherwise Website — the 80% workhorse and the safe default.
import type { CardType } from '@/lib/cardType'

export type Category =
  | 'Website' | 'Product' | 'Article' | 'Music'
  | 'Podcast' | 'Video' | 'Social' | 'Book' | 'Place'

export type Affordance = 'play' | 'price' | 'rating' | 'favicon' | 'disc' | 'mic' | 'avatar' | null

export interface CardFormat {
  category: Category
  label: string
  // Fallback plate shape for an IMAGELESS card. Cards WITH an image render at
  // the image's natural aspect (no crop, no letterbox).
  aspect: string
  affordance: Affordance
}

const SPEC: Record<Category, { aspect: string; affordance: Affordance }> = {
  Website: { aspect: '4 / 3',    affordance: null },     // the 80% workhorse
  Product: { aspect: '3 / 4',    affordance: 'price' },
  Article: { aspect: '3 / 2',    affordance: 'favicon' },
  Music:   { aspect: '1 / 1',    affordance: 'disc' },
  Podcast: { aspect: '1 / 1',    affordance: 'mic' },
  Video:   { aspect: '16 / 9',   affordance: 'play' },
  Social:  { aspect: '4 / 5',    affordance: 'avatar' },
  Book:    { aspect: '2 / 3',    affordance: null },
  // A map link has no og:image worth showing, so an imageless Place falls back
  // to the same 4:3 plate as Website. The affordance is the RATING, in the same
  // top-left slot a product's price uses, so the one fact worth scanning in a
  // grid sits where every other type's does. Was null while the rating lived in
  // the facts block below — it has moved up, not been duplicated.
  Place:   { aspect: '4 / 3',    affordance: 'rating' },
}

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
function path(url: string): string {
  try { return new URL(url).pathname } catch { return '' }
}

// ── Strong domain/URL signals (win over the stored card_type) ────────────────
function categoryFromUrl(url: string): Category | null {
  const h = host(url)
  const p = path(url)
  const is = (...ds: string[]) => ds.some((d) => h === d || h.endsWith('.' + d))

  if (is('youtube.com', 'youtu.be', 'vimeo.com', 'tiktok.com', 'loom.com')) return 'Video'
  if (is('podcasts.apple.com', 'pod.link', 'overcast.fm', 'pocketcasts.com')) return 'Podcast'
  if (h === 'open.spotify.com') return /^\/(episode|show)\//.test(p) ? 'Podcast' : 'Music'
  if (is('music.apple.com', 'bandcamp.com', 'soundcloud.com')) return 'Music'
  if (is('x.com', 'twitter.com', 'reddit.com', 'linkedin.com', 'instagram.com', 'threads.net', 'facebook.com')) return 'Social'
  if (is('goodreads.com', 'bookshop.org') || h.startsWith('books.google')) return 'Book'
  // Places. Scoped to the /maps path on google.* so an ordinary google.com
  // link is untouched (and books.google, matched above, is a disjoint host).
  // Mirrors isPlaceUrl() in lib/placeLink.ts — keep the two in step.
  if (is('maps.app.goo.gl') || h === 'maps.google.com' || is('maps.apple.com')) return 'Place'
  if ((h.startsWith('google.') || h.includes('.google.')) && p.startsWith('/maps')) return 'Place'
  return null
}

// ── card_type → category (when no strong URL signal) ─────────────────────────
const FROM_TYPE: Record<string, Category> = {
  product: 'Product',
  fullbleed: 'Product',
  article: 'Article',
  book: 'Book',
  composite: 'Social',
  tweet: 'Social',
  profile: 'Social',
  screenshot: 'Website',
  lth: 'Website',
}

export function resolveCategory(url: string, cardType?: CardType | string | null): CardFormat {
  const category = categoryFromUrl(url) || (cardType && FROM_TYPE[cardType]) || 'Website'
  const spec = SPEC[category]
  return { category, label: category, ...spec }
}
