import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  extractMetadata,
  deriveFromRaw,
  type MetadataResult,
  type RawMetadata,
} from '@/lib/metadata'
import { screenshotApiUrl } from '@/lib/screenshot'
import { classifyCardType, type CardType } from '@/lib/cardType'

// Use service role key if available (bypasses RLS), else anon key + RPC.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// CardType + classifyCardType now live in lib/cardType.ts, shared with the save
// paths (so card_type is set at insert) and the image router (lib/cardImage.ts).

// Live screenshotone URL (env key). persist-screenshots later captures this
// once and swaps screenshot_url for a permanent Supabase Storage copy.
function screenshotUrl(url: string): string {
  return screenshotApiUrl(url)
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
