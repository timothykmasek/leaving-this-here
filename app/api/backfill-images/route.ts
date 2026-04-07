import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractMetadata,
  deriveFromRaw,
  type MetadataResult,
  type RawMetadata,
} from '@/lib/metadata'

// Use service role key if available (bypasses RLS), else anon key + RPC.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type CardType = 'composite' | 'fullbleed' | 'screenshot' | 'profile'

// ── Classification helpers ──────────────────────────────────────────

const SOCIAL_PROFILE_DOMAINS = [
  'instagram.com', 'twitter.com', 'x.com',
  'tiktok.com', 'threads.net', 'pinterest.com',
]

const PRODUCT_URL_SIGNALS = [
  '/product', '/products/', '/shop/', '/item/',
  'oliverandclarke.com', 'bookshop.org', 'waterstones.com',
  'amazon.com', 'ebay.com', 'etsy.com',
]

const ARTICLE_URL_SIGNALS = [
  '/article', '/post/', '/blog/', '/news/', '/media/',
  '/features/', '/opinion/', '/review/',
  'adweek.com', 'variety.com', 'retaildive.com', 'andscape.com',
  'techcrunch.com', 'theverge.com', 'arstechnica.com', 'wired.com',
  'medium.com', 'substack.com', 'nytimes.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'forbes.com', 'theguardian.com', 'washingtonpost.com',
  'thetimes.com', 'beautyindependent.com', 'airmail.news',
]

function classifyCardType(url: string, meta: MetadataResult): CardType {
  try {
    const urlLower = url.toLowerCase()
    const hostname = new URL(url).hostname.replace('www.', '')
    const pathname = new URL(url).pathname

    // Social profiles
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

    // Product pages
    if (PRODUCT_URL_SIGNALS.some(s => urlLower.includes(s))) {
      return meta.image ? 'fullbleed' : 'screenshot'
    }

    // Article / news / blog
    if (ARTICLE_URL_SIGNALS.some(s => urlLower.includes(s))) {
      return 'composite'
    }

    // Homepage (bare domain)
    if (pathname === '/' || pathname === '') {
      return 'screenshot'
    }

    // Fallback: has OG image + title → composite, else screenshot
    if (meta.image && meta.title) {
      return 'composite'
    }

    return 'screenshot'
  } catch {
    return 'screenshot'
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

        if (meta.image && cardType !== 'screenshot') {
          update.image_url = meta.image
        }
        if (cardType === 'screenshot' && !bm.image_url?.includes('screenshotone')) {
          // Only generate a new screenshot URL if we don't already have one
          update.screenshot_url = screenshotUrl(bm.url)
        }
        if (meta.favicon) {
          update.favicon_url = meta.favicon
        }
        if (meta.title) {
          // Always overwrite title with the picker's choice — that's the point of this route
          update.title = meta.title
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
