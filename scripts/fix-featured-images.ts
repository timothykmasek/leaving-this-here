// One-off production data fix for the mobile-feedback pass.
//
// Fixes three things in the `bookmarks` table:
//   1. thum.io rot — some rows (notably the featured Crosby & Pairs) had a live
//      `https://image.thum.io/get/...` URL written into image_url/screenshot_url
//      by old seeding. Those render thum.io's own loading spinner + a cropped
//      capture, never our content. We purge every thum.io value.
//   2. Crosby & Pairs — instead of just nulling their thum.io image, we restore
//      their real og:image hero (from lib/featured's FEATURED_IMAGES) by copying
//      it into Supabase Storage and pointing image_url at the permanent copy.
//   3. Terrenus Energy — regressed to a bare logo plate (its og:image is a logo
//      and it has no usable screenshot). We capture a fresh screenshot and set
//      screenshot_url so the card shows the page instead of the plate.
//
// Any thum.io-purged row that ends up with NO usable image gets a fresh
// screenshot too, so nothing is left blank.
//
// SAFE BY DEFAULT: dry-run unless you pass --apply. Dry-run prints exactly what
// it WOULD write and touches nothing.
//
// Required env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SCREENSHOTONE_ACCESS_KEY.
//
//   npx tsx scripts/fix-featured-images.ts            # dry-run (preview)
//   npx tsx scripts/fix-featured-images.ts --apply    # write changes

import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { persistCardImage, captureAndStore, isPersistedScreenshot } from '../lib/screenshot'
import { FEATURED_IMAGES } from '../lib/featured'

// ── env loader (no dotenv dep) ───────────────────────────────────────
for (const line of fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error('missing Supabase env')
if (!process.env.SCREENSHOTONE_ACCESS_KEY) throw new Error('missing SCREENSHOTONE_ACCESS_KEY')

const APPLY = process.argv.includes('--apply')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const isThumIo = (u: string | null | undefined) => !!u && /(^|\.)thum\.io/i.test((() => {
  try { return new URL(u).hostname } catch { return '' }
})())

type Row = { id: string; url: string; image_url: string | null; screenshot_url: string | null }

async function update(id: string, patch: Partial<Row>) {
  if (!APPLY) {
    console.log(`   would UPDATE ${id}:`, patch)
    return
  }
  const { error } = await supabase.from('bookmarks').update(patch).eq('id', id)
  if (error) console.log(`   ✗ update failed ${id}: ${error.message}`)
  else console.log(`   ✓ updated ${id}:`, patch)
}

async function main() {
  console.log(APPLY ? '── APPLY MODE (writing) ──\n' : '── DRY RUN (no writes; pass --apply to write) ──\n')

  // 1 + 2 · Purge thum.io; restore Crosby/Pairs to their frozen og hero.
  const { data: thumRows, error: e1 } = await supabase
    .from('bookmarks')
    .select('id, url, image_url, screenshot_url')
    .or('image_url.ilike.%thum.io%,screenshot_url.ilike.%thum.io%')
  if (e1) throw new Error(`query thum.io rows: ${e1.message}`)

  console.log(`[1] thum.io rows found: ${thumRows?.length ?? 0}`)
  for (const r of (thumRows ?? []) as Row[]) {
    const patch: Partial<Row> = {}
    if (isThumIo(r.image_url)) patch.image_url = null
    if (isThumIo(r.screenshot_url)) patch.screenshot_url = null

    // Featured Crosby / Pairs: replace, don't just null — persist their real og
    // hero into storage so the card is beautiful and stable everywhere.
    const frozen = FEATURED_IMAGES[r.url]
    if (frozen) {
      console.log(`   ${r.url} → persisting og hero`)
      if (APPLY) {
        const { publicUrl, error } = await persistCardImage(supabase, r.id, frozen)
        if (error) console.log(`   ✗ persist failed: ${error} — falling back to hotlink`)
        patch.image_url = publicUrl && !error ? publicUrl : frozen
      } else {
        patch.image_url = `(dry-run persist) ${frozen}`
      }
    }
    await update(r.id, patch)

    // If purging left the row with no usable image, capture a screenshot.
    const stillHasImage =
      (patch.image_url ?? r.image_url) || (patch.screenshot_url ?? r.screenshot_url)
    if (!stillHasImage) {
      console.log(`   ${r.url} → no image left, capturing screenshot`)
      if (APPLY) {
        const { publicUrl, error } = await captureAndStore(supabase, r.id, r.url, { fresh: true })
        if (error) console.log(`   ✗ capture failed: ${error}`)
        else await update(r.id, { screenshot_url: publicUrl })
      } else {
        console.log(`   would capture screenshot for ${r.id}`)
      }
    }
  }

  // 3 · Terrenus Energy — recapture a fresh screenshot.
  const { data: terr, error: e2 } = await supabase
    .from('bookmarks')
    .select('id, url, image_url, screenshot_url')
    .ilike('url', '%terrenus%')
  if (e2) throw new Error(`query terrenus: ${e2.message}`)

  console.log(`\n[3] Terrenus rows found: ${terr?.length ?? 0}`)
  for (const r of (terr ?? []) as Row[]) {
    // Its image_url is a Gravatar mystery-man avatar (the blue blob). The render
    // fix (lib/cardImage) already demotes gravatars below a screenshot, but null
    // it here too so the row is clean.
    const isGravatar = !!r.image_url && /(^|\.)gravatar\.com/i.test((() => {
      try { return new URL(r.image_url!).hostname } catch { return '' }
    })())
    if (isGravatar) await update(r.id, { image_url: null })

    if (isPersistedScreenshot(r.screenshot_url)) {
      console.log(`   ${r.url} already has a persisted screenshot — recapturing fresh for a better hero`)
    }
    console.log(`   ${r.url} → capturing fresh screenshot`)
    if (APPLY) {
      const { publicUrl, error } = await captureAndStore(supabase, r.id, r.url, { fresh: true })
      if (error) console.log(`   ✗ capture failed: ${error}`)
      else await update(r.id, { screenshot_url: publicUrl })
    } else {
      console.log(`   would capture fresh screenshot for ${r.id}`)
    }
  }

  console.log('\nDone.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
