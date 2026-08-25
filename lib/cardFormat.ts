// The 8 Bulletin card categories (Tim, 2026-08-15) and how a bullet resolves to
// one. Resolution happens at RENDER time — no DB migration, no classifier
// rewrite — so it works on every existing row and stays reversible:
//   1. Strong URL/domain signals win first (a youtube link is Video even if the
//      stored card_type says 'article' — the classifier is noisy, see the audit).
//   2. Otherwise fall back to the stored card_type.
//   3. Otherwise Website — the 80% workhorse and the safe default.
import type { CardType } from '@/lib/cardType'
import { isPlaceUrl } from '@/lib/placeLink'

export type Category =
  | 'Website' | 'Product' | 'Article' | 'Music'
  | 'Podcast' | 'Video' | 'Social' | 'Book' | 'Place' | 'App'

export type Affordance = 'play' | 'price' | 'rating' | 'favicon' | 'disc' | 'mic' | 'avatar' | null

// Which categories show the SOURCE MARK — the site's own favicon, bottom-left.
//
// Only where the PLATFORM is part of the meaning: a track, an episode, a post,
// a video. For a shop or an article the domain is already on the caption line,
// so a mark there is a small broken-looking box for no information.
//
// Deliberately by CATEGORY, not by affordance kind: Video's affordance is
// `play`, which is a capability rather than a source, and a video wants both —
// the play button centred and the platform's mark in the corner.
const SOURCE_MARK_CATEGORIES = new Set<Category>(['Social', 'Music', 'Podcast', 'Video', 'App'])

export function showsSourceMark(category: Category): boolean {
  return SOURCE_MARK_CATEGORIES.has(category)
}

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
  // No affordance: an article's source is already named on the caption line,
  // so a favicon plate on the photo only adds a box.
  Article: { aspect: '3 / 2',    affordance: null },
  Music:   { aspect: '1 / 1',    affordance: 'disc' },
  Podcast: { aspect: '1 / 1',    affordance: 'mic' },
  Video:   { aspect: '16 / 9',   affordance: 'play' },
  Social:  { aspect: '4 / 5',    affordance: 'avatar' },
  Book:    { aspect: '2 / 3',    affordance: null },
  // An app-store listing. The mark is the store's own — it says WHERE this
  // lives, which for an app is the useful half (App Store vs Play). 4:3 like
  // Website: store og:images are wide hero shots, not covers.
  App:     { aspect: '4 / 3',    affordance: null },
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
  // Apps means a store LISTING, not "a site that happens to be software".
  // Deliberately a narrow allowlist: a link to Linear or Figma is a Website,
  // which is ~80% of all cards — marking those would put a plate on nearly
  // everything, the opposite of what the source mark is for. Note the Apple
  // hosts are siblings of podcasts.apple.com and music.apple.com, matched
  // above, so ordering matters and this must stay below them.
  if (is('apps.apple.com', 'itunes.apple.com', 'testflight.apple.com')) return 'App'
  if (h === 'play.google.com' && p.startsWith('/store/apps')) return 'App'
  // Places. Asks isPlaceUrl() rather than restating its rules: this used to be
  // a copy under a "keep the two in step" comment, and the copy had already
  // fallen behind — it was missing openstreetmap.org and goo.gl/maps, so those
  // links were enriched with place facts by the save path and then rendered as
  // ordinary websites, with no 4/3 plate and no rating. One definition can't
  // drift from itself.
  //
  // Ordering still matters: books.google and play.google.com/store/apps are
  // matched above, and isPlaceUrl only claims /maps paths on google hosts.
  if (isPlaceUrl(url)) return 'Place'
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
