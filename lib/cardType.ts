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

/** True if a URL strongly looks like a logo / wordmark / brand asset. */
function looksLikeLogoUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr) return false
  const lower = urlStr.toLowerCase()
  if (/\b(logo|favicon|brandmark|wordmark|sprite|symbol|emblem)\b/.test(lower)) return true
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
