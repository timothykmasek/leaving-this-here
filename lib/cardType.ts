// Card-type classification — the single source of truth for "what kind of
// thing is this link," shared by the save paths, the backfill job, and the
// image router (lib/cardImage.ts).
//
// Kept runtime-dependency-free (only a type-only import of MetadataResult) so
// it's safe to import into client components without dragging the metadata
// parser into the browser bundle.

import type { MetadataResult } from '@/lib/metadata'

export type CardType =
  | 'composite'
  | 'fullbleed'
  | 'screenshot'
  | 'profile'
  | 'product'
  | 'article'
  | 'book'
  | 'tweet'
  | 'lth'

const SOCIAL_PROFILE_DOMAINS = [
  'instagram.com', 'twitter.com', 'x.com',
  'tiktok.com', 'threads.net', 'pinterest.com',
]

const BOOK_DOMAINS = [
  'bookshop.org', 'goodreads.com', 'waterstones.com',
  'penguinrandomhouse.com', 'hachettebookgroup.com', 'harpercollins.com',
  'simonandschuster.com', 'macmillan.com',
]

const PRODUCT_URL_SIGNALS = [
  '/product', '/products/', '/shop/', '/item/',
  'oliverandclarke.com', 'amazon.com', 'ebay.com', 'etsy.com',
  'rimowa.com', 'christofle.com',
]

const ARTICLE_URL_SIGNALS = [
  '/article', '/post/', '/blog/', '/news/', '/media/',
  '/features/', '/opinion/', '/review/', '/story/',
  'adweek.com', 'variety.com', 'retaildive.com', 'andscape.com',
  'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com',
  'medium.com', 'substack.com', 'nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'forbes.com', 'theguardian.com', 'washingtonpost.com',
  'thetimes.com', 'beautyindependent.com', 'airmail.news',
  'axios.com', 'businessinsider.com', 'deadline.com', 'menshealth.com',
  'newsfromthestates.com',
]

// Page titles that mean the fetch landed on a block / challenge / error /
// parked / login page rather than real content — nothing worth screenshotting.
// Kept conservative: full-phrase signals only (no bare 'login'/'404'/'cart',
// which appear inside legitimate titles). Lives here (the runtime-dep-free
// module) so both classifyCardType and server code can share it.
export const BAD_PAGE_TITLE_SIGNALS = [
  'you have been blocked',
  'attention required!',
  'just a moment',
  'access denied',
  'access to this page has been denied',
  '403 forbidden',
  'are you a robot',
  'security check',
  'verifying you are human',
  'welcome to nginx',
  'apache2 ubuntu default page',
  'index of /',
  'account suspended',
  'this domain is for sale',
  'domain for sale',
  'buy this domain',
  'sign in to continue',
  // 404s — full phrases only (bare "404" appears in legit titles like street
  // addresses / route numbers, so it's deliberately excluded).
  'page not found',
  'page could not be found',
  "page doesn't exist",
  'page cannot be found',
  '404 not found',
]

/** True when a page title looks like a block/challenge/parked/login interstitial. */
export function looksLikeBadPageTitle(title: string | null | undefined): boolean {
  if (!title) return false
  const lower = title.toLowerCase()
  return BAD_PAGE_TITLE_SIGNALS.some((s) => lower.includes(s))
}

/** True if a URL strongly looks like a logo / wordmark / brand asset. */
export function looksLikeLogoUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr) return false
  const lower = urlStr.toLowerCase()
  // Match the keyword when flanked by anything that isn't an alphanumeric —
  // `_`, `-`, `/`, `.` all count as separators. Plain `\b` fails here because
  // `_` is a word char, so `\bwordmark\b` misses `mistergreen_wordmark_logo.png`.
  if (/(?<![a-z0-9])(logo|favicon|brandmark|wordmark|sprite|symbol|emblem)(?![a-z0-9])/.test(lower)) return true
  if (/\/(icons?|logos?|brand|brandmarks)\//.test(lower)) return true
  return false
}

function isAmazonBook(url: string): boolean {
  // Amazon books live under /dp/ or /gp/product/ with ISBN-shaped IDs
  if (!url.includes('amazon.')) return false
  return /\/(dp|gp\/product)\/(\d{9}[\dX]|\d{13})/i.test(url)
}

export function classifyCardType(url: string, meta: MetadataResult): CardType {
  try {
    const urlLower = url.toLowerCase()
    const hostname = new URL(url).hostname.replace('www.', '')
    const pathname = new URL(url).pathname
    const imageIsLogo = looksLikeLogoUrl(meta.image)

    // ── Block / challenge / parked / error page → nothing to screenshot.
    // Detected from the fetched title (raw htmlTitle survives even when
    // pickBestTitle nulls it out). Returns lth so no screenshot is attempted
    // and the card renders the clean plate instead of a "you've been blocked"
    // interstitial. Content signals below (book/product) still win if present.
    if (
      !meta.image && !meta.book && !meta.product &&
      (looksLikeBadPageTitle(meta.title) || looksLikeBadPageTitle(meta.raw?.htmlTitle))
    ) {
      return 'lth'
    }

    // ── Books — highest specificity, JSON-LD or domain heuristic ─────
    if (meta.book && meta.book.title) {
      return 'book'
    }
    if (BOOK_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return 'book'
    }
    if (isAmazonBook(url)) {
      return 'book'
    }

    // ── Products — schema.org/Product (price now optional) ───────────
    if (meta.product && meta.product.name) {
      return 'product'
    }

    // ── Tweets — a single status is content, not a profile. No tweet
    // layout exists yet (renders as the generic plate); the type is set at
    // save time so the data is ready when the per-type card ships. ─────
    if (
      (hostname === 'x.com' || hostname === 'twitter.com' ||
        hostname.endsWith('.x.com') || hostname.endsWith('.twitter.com')) &&
      /\/status\/\d+/.test(pathname)
    ) {
      return 'tweet'
    }

    // ── Social profiles ──────────────────────────────────────────────
    if (SOCIAL_PROFILE_DOMAINS.some(d => hostname.includes(d))) {
      if (meta.image && !meta.image.includes('/static/') && !meta.image.includes('/rsrc/')) {
        return 'composite'
      }
      return 'profile'
    }

    // LinkedIn: profile pages → composite if OG image, else profile
    if (hostname.includes('linkedin.com')) {
      return meta.image ? 'composite' : 'profile'
    }

    // ── Articles ─────────────────────────────────────────────────────
    // Articles get their own card type (image-on-top, title-below).
    // No more "composite for articles" — composite is reserved for
    // social/profile pages where stitched-photo OGs are expected.
    if (ARTICLE_URL_SIGNALS.some(s => urlLower.includes(s))) {
      // If the image is logo-shaped, render LTH fallback instead.
      if (imageIsLogo || !meta.image) return 'lth'
      return 'article'
    }

    // ── Generic product URL pattern (when no JSON-LD/Product node) ───
    if (PRODUCT_URL_SIGNALS.some(s => urlLower.includes(s))) {
      if (imageIsLogo || !meta.image) return 'lth'
      return 'fullbleed'
    }

    // Homepage (bare domain) → screenshot of the landing page
    if (pathname === '/' || pathname === '') {
      return 'screenshot'
    }

    // ── Fallback: has image + title → article-style ─────────────────
    if (meta.image && !imageIsLogo && meta.title) {
      return 'article'
    }

    // Nothing usable → LTH branded fallback (no broken-image energy)
    if (imageIsLogo || !meta.image) {
      return 'lth'
    }

    return 'screenshot'
  } catch {
    return 'lth'
  }
}
