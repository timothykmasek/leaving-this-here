// Backfill bookmarks.raw_metadata.product — the price a product card shows.
//
// Free and offline: the schema.org/Product JSON-LD was already captured and
// stored at save time, so this only re-reads what's in the row. No fetches, no
// API calls, no re-capture. New saves get the field written inline by
// lib/productFact's withProductFact(); this is only for rows saved before that.
//
// The offers walk below MIRRORS pickProduct() in lib/metadata.ts. It's
// duplicated rather than imported because this is a plain .mjs script and the
// lib is TypeScript with '@/' imports — the same reason
// scripts/backfill-card-quality.mjs restates its rules. If pickProduct's offer
// handling changes, change it here too.
//
// Dry-run by default (counts only). Pass --apply to write.
//
//   node scripts/backfill-product-price.mjs           # dry run
//   node scripts/backfill-product-price.mjs --apply   # apply
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const APPLY = process.argv.includes('--apply')

// --- mirrors lib/metadata.ts findProductNode ---
function findProductNode(jsonLd) {
  const found = []
  const typeMatches = (t) => {
    if (!t) return false
    if (typeof t === 'string') return t === 'Product' || t.endsWith('/Product')
    if (Array.isArray(t)) return t.some(typeMatches)
    return false
  }
  const walk = (n) => {
    if (!n) return
    if (Array.isArray(n)) return n.forEach(walk)
    if (typeof n !== 'object') return
    if (typeMatches(n['@type'])) found.push(n)
    if (n['@graph']) walk(n['@graph'])
    for (const v of Object.values(n)) if (v && typeof v === 'object') walk(v)
  }
  walk(jsonLd)
  return found[0] || null
}

// --- mirrors lib/metadata.ts formatPrice ---
function formatPrice(price, currency) {
  const symbolMap = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$' }
  const symbol = currency ? (symbolMap[currency] || currency + ' ') : '$'
  const isWhole = Math.abs(price - Math.round(price)) < 0.01
  return symbol + (isWhole ? String(Math.round(price)) : price.toFixed(2))
}

// --- mirrors lib/metadata.ts pickProduct's offers walk + lib/productFact ---
function factFor(raw) {
  const node = findProductNode((raw && raw.jsonLd) || [])
  if (!node || typeof node.name !== 'string' || !node.name.trim()) return null

  const offers = node.offers
  const first =
    Array.isArray(offers) && offers.length ? offers[0] :
    offers && typeof offers === 'object' ? offers : null
  if (!first) return null

  const rawPrice = first.price ?? first.lowPrice ?? (first.priceSpecification && first.priceSpecification.price)
  let price = null
  if (typeof rawPrice === 'number' && !isNaN(rawPrice)) price = rawPrice
  else if (typeof rawPrice === 'string') {
    const parsed = parseFloat(rawPrice.replace(/[^0-9.]/g, ''))
    if (!isNaN(parsed)) price = parsed
  }
  // Zero is not a price, and a million-plus is a sentinel — see lib/productFact.
  if (price === null || price === 0) return null
  if (price < 0 || price > 1_000_000) return null

  const rawCurrency =
    first.priceCurrency || (first.priceSpecification && first.priceSpecification.priceCurrency) || null
  const currency = typeof rawCurrency === 'string' ? rawCurrency.toUpperCase() : null

  return { priceFormatted: formatPrice(price, currency), price, currency }
}

let scanned = 0, already = 0, resolved = 0, written = 0, noPrice = 0
for (let from = 0; ; from += 500) {
  const { data, error } = await sb
    .from('bookmarks')
    .select('id, url, raw_metadata')
    .eq('card_type', 'product')
    .range(from, from + 499)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data.length) break

  for (const b of data) {
    scanned++
    const raw = b.raw_metadata
    if (!raw) { noPrice++; continue }
    if (raw.product && raw.product.priceFormatted) { already++; continue }
    const fact = factFor(raw)
    if (!fact) { noPrice++; continue }
    resolved++
    if (APPLY) {
      const { error: upErr } = await sb
        .from('bookmarks')
        .update({ raw_metadata: { ...raw, product: fact } })
        .eq('id', b.id)
      if (upErr) console.error(' !', b.url, upErr.message)
      else written++
    } else {
      console.log(' ', fact.priceFormatted.padEnd(10), b.url.slice(0, 72))
    }
  }
  if (data.length < 500) break
}

console.log(
  `\nscanned ${scanned} product bookmarks · ${already} already had one · ` +
  `${resolved} resolvable · ${noPrice} without a usable price` +
  (APPLY ? ` · ${written} written` : ' · DRY RUN (pass --apply to write)')
)
