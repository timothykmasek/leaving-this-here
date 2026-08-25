// Copy third-party card images into our own bucket.
//
// A quarter of the library still points its image_url at the site it came from
// — 165 distinct hosts. Every one is a separate DNS lookup and TLS handshake
// for the reader's browser, and they were by far the slowest things on a
// profile: polsia.com 1745ms, cdn.sanity.io 1513ms, cdn.shopify.com 1455ms,
// against ~200ms for anything already in our bucket, which is on a connection
// the browser has open anyway.
//
// It also stops them rotting. A remote og:image can be moved or deleted by its
// owner at any time, which is exactly why some cards render a broken frame
// today (myhabits.io and static.pushd.com both 404 now).
//
// Mirrors persistCardImage() in lib/screenshot.ts — same fetch rules, same
// `og/<id>.<ext>` namespace, same immutable cache header. Restated in plain JS
// rather than imported because that lib is TypeScript with '@/' imports, the
// same reason scripts/backfill-card-quality.mjs restates its rules.
//
// Dry-run by default. Nothing is written, downloaded or uploaded without
// --apply; the dry run only lists what it WOULD do.
//
//   node scripts/backfill-remote-images.mjs            # dry run
//   node scripts/backfill-remote-images.mjs --apply    # do it
//   node scripts/backfill-remote-images.mjs --apply --limit 20
//
// Safe to re-run: a row whose image already lives in our bucket is skipped, so
// an interrupted run picks up where it stopped.

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
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit')
  return i === -1 ? Infinity : Number(process.argv[i + 1]) || Infinity
})()

const BUCKET = 'card-images'
const MIN_BYTES = 500
const MAX_BYTES = 5_000_000
// Be a considerate guest: 165 hosts, one request at a time, with a breath
// between. This is a background chore, not a race.
const GAP_MS = 250

const isOurs = (u) => !!u && u.includes(`/${BUCKET}/`)
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '?' } }

async function fetchImage(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    })
    const contentType = res.headers.get('content-type') || ''
    if (!res.ok) return { error: `HTTP ${res.status}` }
    if (!contentType.startsWith('image/')) return { error: `not an image (${contentType || 'no type'})` }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < MIN_BYTES || bytes.byteLength > MAX_BYTES) {
      return { error: `implausible size ${bytes.byteLength}B` }
    }
    return { bytes, contentType }
  } catch (err) {
    return { error: String(err.name === 'AbortError' ? 'timeout' : err) }
  } finally {
    clearTimeout(timeout)
  }
}

const extFor = (t) => (/png/.test(t) ? 'png' : /webp/.test(t) ? 'webp' : /gif/.test(t) ? 'gif' : 'jpg')

// ── gather ──────────────────────────────────────────────────────────────────
let rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb
    .from('bookmarks')
    .select('id, url, image_url')
    .not('image_url', 'is', null)
    .range(from, from + 999)
  if (error) { console.error(error.message); process.exit(1) }
  rows = rows.concat(data || [])
  if (!data || data.length < 1000) break
}

const todo = rows.filter((b) => !isOurs(b.image_url)).slice(0, LIMIT)
const hosts = new Set(todo.map((b) => hostOf(b.image_url)))
console.log(`${rows.length} bookmarks with an image · ${todo.length} still third-party · ${hosts.size} hosts`)
if (!APPLY) {
  console.log('\nDRY RUN — nothing fetched or written. Sample of what would be copied:\n')
  todo.slice(0, 15).forEach((b) => console.log('  ', hostOf(b.image_url).padEnd(30), b.url.slice(0, 58)))
  if (todo.length > 15) console.log(`   … and ${todo.length - 15} more`)
  console.log('\nRe-run with --apply to do it.')
  process.exit(0)
}

// ── copy ────────────────────────────────────────────────────────────────────
let ok = 0, failed = 0
const failures = {}
for (const [i, b] of todo.entries()) {
  const host = hostOf(b.image_url)
  const got = await fetchImage(b.image_url)
  if (got.error) {
    failed++
    failures[got.error.slice(0, 40)] = (failures[got.error.slice(0, 40)] || 0) + 1
    console.log(`  ✕ ${String(i + 1).padStart(4)}/${todo.length} ${host.padEnd(28)} ${got.error}`)
    await new Promise((r) => setTimeout(r, GAP_MS))
    continue
  }
  const path = `og/${b.id}.${extFor(got.contentType)}`
  const { error: upErr } = await sb.storage.from(BUCKET).upload(path, got.bytes, {
    contentType: got.contentType,
    upsert: true,
    cacheControl: '31536000, immutable',
  })
  if (upErr) {
    failed++
    console.log(`  ✕ ${String(i + 1).padStart(4)}/${todo.length} ${host.padEnd(28)} upload: ${upErr.message}`)
    await new Promise((r) => setTimeout(r, GAP_MS))
    continue
  }
  const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { error: dbErr } = await sb
    .from('bookmarks')
    .update({ image_url: `${pub}?v=${Date.now()}` })
    .eq('id', b.id)
  if (dbErr) {
    failed++
    console.log(`  ✕ ${String(i + 1).padStart(4)}/${todo.length} ${host.padEnd(28)} db: ${dbErr.message}`)
  } else {
    ok++
    if (ok % 25 === 0 || i === todo.length - 1) {
      console.log(`  ✓ ${String(i + 1).padStart(4)}/${todo.length} copied ${ok}, failed ${failed}`)
    }
  }
  await new Promise((r) => setTimeout(r, GAP_MS))
}

console.log(`\ncopied ${ok} · failed ${failed}`)
if (failed) {
  console.log('failures by reason:')
  Object.entries(failures).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${String(v).padStart(4)}  ${k}`))
  console.log('\nA failure leaves the row untouched, still pointing at its original —')
  console.log('nothing is lost, and re-running retries only what is still remote.')
}
