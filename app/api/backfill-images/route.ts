import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractMetadata,
  deriveFromRaw,
  looksLikeLogoUrl,
  type MetadataResult,
  type RawMetadata,
} from '@/lib/metadata'

// Use service role key if available (bypasses RLS), else anon key + RPC.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type CardType =
  | 'composite'
  | 'fullbleed'
  | 'screenshot'
  | 'profile'
  | 'product'
  | 'article'
  | 'book'
  | 'lth'

// ── Classification helpers ──────────────────────────────────────────

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

function isAmazonBook(url: string): boolean {
  // Amazon books live under /dp/ or /gp/product/ with ISBN-shaped IDs
  if (!url.includes('amazon.')) return false
  return /\/(dp|gp\/product)\/(\d{9}[\dX]|\d{13})/i.test(url)
}

function classifyCardType(url: string, meta: MetadataResult): CardType {
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

function screenshotUrl(url: string): string {
  const encoded = encodeURIComponent(url)
  return `https://api.screenshotone.com/take?access_key=C3xT-xTVEXsWww&url=${encoded}&viewport_width=1280&viewport_height=900&format=webp&image_quality=90&block_ads=true&block_cookie_banners=true&block_chats=true&delay=2&cache=true&cache_ttl=86400`
}

async function applyUpdate(bookmarkId: string, update: Record<string, any>, raw: RawMetadata | null) {
  return supabaseAdmin.rpc('backfill_bookmark', {
    bookmark_id: bookmarkId,
    new_card_type: update.card_type ?? null,
    new_image_url: update.image_url ?? null,
    new_screenshot_url: update.screenshot_url ?? null,
    new_favicon_url: update.favicon_url ?? null,
    new_title: update.title ?? null,
    new_description: update.description ?? null,
    new_raw_metadata: raw ?? null,
  })
}

// ── Main handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      limit = 10,
      offset = 0,
      mode = 'fetch', // 'fetch' | 'reclassify' | 'fetch-missing'
    } = body

    // Build the select query based on mode
    // - fetch: re-fetch + re-process ALL bookmarks (expensive)
    // - reclassify: run pickers over stored raw_metadata (free, no network)
    // - fetch-missing: only fetch bookmarks without card_type set
    let query = supabaseAdmin
      .from('bookmarks')
      .select('id, url, title, description, image_url, favicon_url, raw_metadata, card_type')
      .order('created_at', { ascending: false })

    if (mode === 'fetch-missing') {
      query = query.is('card_type', null)
    }
    // 'fetch' and 'reclassify' process everything

    const { data: bookmarks, error: fetchError } = await query.range(offset, offset + limit - 1)

    if (fetchError || !bookmarks) {
      return NextResponse.json(
        { error: fetchError?.message || 'Failed to fetch bookmarks' },
        { status: 500 },
      )
    }

    const results: any[] = []
    let processed = 0
    let errors = 0

    for (const bm of bookmarks) {
      try {
        let meta: MetadataResult
        let raw: RawMetadata | null

        if (mode === 'reclassify' && bm.raw_metadata) {
          // Free path: re-derive from stored raw data
          raw = bm.raw_metadata as RawMetadata
          meta = deriveFromRaw(raw)
        } else {
          // Network path: fetch HTML and re-extract
          meta = await extractMetadata(bm.url)
          raw = meta.raw
        }

        const cardType = classifyCardType(bm.url, meta)

        const update: Record<string, any> = { card_type: cardType }

        // Product cards prefer product.name / product.image over og:*
        if (cardType === 'product' && meta.product) {
          if (meta.product.image) update.image_url = meta.product.image
          else if (meta.image) update.image_url = meta.image
          update.title = meta.product.name
        } else if (cardType === 'book' && meta.book) {
          // Book cards prefer book.title / book.image
          if (meta.book.image) update.image_url = meta.book.image
          else if (meta.image) update.image_url = meta.image
          update.title = meta.book.title
        } else if (cardType === 'lth') {
          // LTH fallback — no image needed, just title + domain
          if (meta.title) update.title = meta.title
          // Explicitly clear any stale logo image so the fallback renders clean
          update.image_url = null
        } else {
          if (meta.image && cardType !== 'screenshot') {
            update.image_url = meta.image
          }
          if (meta.title) {
            // Always overwrite title with the picker's choice
            update.title = meta.title
          }
        }

        if (cardType === 'screenshot' && !bm.image_url?.includes('screenshotone')) {
          // Only generate a new screenshot URL if we don't already have one
          update.screenshot_url = screenshotUrl(bm.url)
        }
        if (meta.favicon) {
          update.favicon_url = meta.favicon
        }
        if (meta.description && !bm.description) {
          update.description = meta.description
        }

        const { error: updateError } = await applyUpdate(bm.id, update, raw)

        if (updateError) {
          errors++
          results.push({ id: bm.id, url: bm.url, error: updateError.message, success: false })
        } else {
          processed++
          results.push({
            id: bm.id,
            url: bm.url,
            cardType,
            title: update.title ?? bm.title,
            imageUrl: update.image_url ?? bm.image_url,
            success: true,
          })
        }
      } catch (err) {
        errors++
        results.push({ id: bm.id, url: bm.url, error: String(err), success: false })
      }
    }

    return NextResponse.json({
      mode,
      processed,
      errors,
      total: bookmarks.length,
      results,
      offset,
      nextOffset: offset + limit,
      hasMore: bookmarks.length === limit,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
