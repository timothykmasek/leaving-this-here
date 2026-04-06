import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractMetadata, type MetadataResult } from '@/lib/metadata'

// Use service role key to bypass RLS — this is an admin-only route
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
  'medium.com', 'substack.com', 'nytimes.com', 'bbc.com', 'cnn.com',
  'forbes.com', 'theguardian.com', 'washingtonpost.com',
]

function classifyCardType(url: string, meta: MetadataResult): CardType {
  try {
    const urlLower = url.toLowerCase()
    const hostname = new URL(url).hostname.replace('www.', '')
    const pathname = new URL(url).pathname

    // Social profiles
    if (SOCIAL_PROFILE_DOMAINS.some(d => hostname.includes(d))) {
      // If a social profile has a real OG image (not generic), treat as composite
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

// ── Main handler ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { limit = 10, offset = 0 } = await request.json()

    // Get bookmarks that haven't been classified yet
    const { data: bookmarks, error: fetchError } = await supabaseAdmin
      .from('bookmarks')
      .select('id, url, title, description, image_url, favicon_url')
      .is('card_type', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

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
        // Fetch + parse metadata directly (no HTTP hop)
        const meta = await extractMetadata(bm.url)

        // Classify
        const cardType = classifyCardType(bm.url, meta)

        // Build the update payload
        const update: Record<string, any> = { card_type: cardType }

        if (meta.image && cardType !== 'screenshot') {
          update.image_url = meta.image
        }
        if (cardType === 'screenshot') {
          update.screenshot_url = screenshotUrl(bm.url)
        }
        if (meta.favicon) {
          update.favicon_url = meta.favicon
        }
        if (meta.title && !bm.title) {
          update.title = meta.title
        }
        if (meta.description && !bm.description) {
          update.description = meta.description
        }

        // Use SECURITY DEFINER RPC to bypass RLS (works with anon key too)
        const { error: updateError } = await supabaseAdmin.rpc('backfill_bookmark', {
          bookmark_id: bm.id,
          new_card_type: update.card_type ?? null,
          new_image_url: update.image_url ?? null,
          new_screenshot_url: update.screenshot_url ?? null,
          new_favicon_url: update.favicon_url ?? null,
          new_title: update.title ?? null,
          new_description: update.description ?? null,
        })

        if (updateError) {
          errors++
          results.push({ id: bm.id, url: bm.url, error: updateError.message, success: false })
        } else {
          processed++
          results.push({
            id: bm.id, url: bm.url, cardType,
            imageUrl: update.image_url || bm.image_url,
            screenshotUrl: update.screenshot_url || null,
            faviconUrl: update.favicon_url || bm.favicon_url,
            title: update.title || bm.title,
            success: true,
          })
        }
      } catch (err) {
        errors++
        results.push({ id: bm.id, url: bm.url, error: String(err), success: false })
      }
    }

    return NextResponse.json({
      processed, errors, total: bookmarks.length, results,
      offset, nextOffset: offset + limit,
      hasMore: bookmarks.length === limit,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
