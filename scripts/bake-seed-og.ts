// OG-image fallback for seed picker images.
//
// Some seed domains (Shopify / Cloudflare-protected DTC brands) blank-capture
// when ScreenshotOne hits them from a datacenter IP. But they almost always
// ship a good og:image. This grabs that image and stores it at the same
// `card-images/seed/<domain>.webp` path, so a blocked screenshot still yields a
// beautiful card instead of a colour block.
//
//   npx tsx scripts/bake-seed-og.ts <seeds.json> --only domain1,domain2
//
// Run after bake-seed-images.ts, on the domains it reported as failed.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ensureBucket, SCREENSHOT_BUCKET } from '../lib/screenshot'

for (const line of fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8').split('\n') : []) {
  if (!line || line.startsWith('#')) continue
  const i = line.indexOf('=')
  if (i < 0) continue
  const k = line.slice(0, i).trim()
  if (!process.env[k]) process.env[k] = line.slice(i + 1).trim()
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36'
const MIN_BYTES = 6000

const args = process.argv.slice(2)
const seedsPath = args.find((a) => !a.startsWith('--')) || 'seeds.json'
const onlyArg = (() => {
  const i = args.indexOf('--only')
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(',')) : null
})()

type Seed = { domain: string; url: string }
let seeds: Seed[] = JSON.parse(fs.readFileSync(seedsPath, 'utf8'))
if (onlyArg) seeds = seeds.filter((s) => onlyArg.has(s.domain))

function abs(u: string, base: string): string {
  try { return new URL(u, base).toString() } catch { return u }
}

async function ogImage(pageUrl: string): Promise<string | null> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(pageUrl, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } })
    const html = await res.text()
    const finalUrl = res.url || pageUrl
    // Prefer og:image:secure_url > og:image > twitter:image. Handle attr order.
    const patterns = [
      /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image:secure_url["']/i,
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ]
    for (const re of patterns) {
      const m = html.match(re)
      if (m?.[1]) return abs(m[1].replace(/&amp;/g, '&'), finalUrl)
    }
    return null
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function main() {
  await ensureBucket(supabase)
  console.log(`OG fallback for ${seeds.length} domains…\n`)
  const ok: string[] = []
  const failed: { domain: string; error: string }[] = []

  for (const s of seeds) {
    const img = await ogImage(s.url)
    if (!img) { failed.push({ domain: s.domain, error: 'no og:image' }); console.log(`  ✗ ${s.domain} — no og:image`); continue }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 20000)
      const r = await fetch(img, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': UA } })
      clearTimeout(t)
      const ct = r.headers.get('content-type') || 'image/jpeg'
      if (!r.ok || !ct.startsWith('image/')) { failed.push({ domain: s.domain, error: `og fetch HTTP ${r.status}` }); console.log(`  ✗ ${s.domain} — og fetch ${r.status}`); continue }
      const bytes = new Uint8Array(await r.arrayBuffer())
      if (bytes.byteLength < MIN_BYTES) { failed.push({ domain: s.domain, error: `og image tiny (${bytes.byteLength}B)` }); console.log(`  ✗ ${s.domain} — og tiny ${bytes.byteLength}B`); continue }
      // Always write the exact path seedImageUrl() reads — seed/<domain>.webp —
      // with the image's REAL content-type. The <img> tag renders JPEG/PNG bytes
      // regardless of the .webp URL suffix, so no conversion is needed.
      const { error } = await supabase.storage
        .from(SCREENSHOT_BUCKET)
        .upload(`seed/${s.domain}.webp`, bytes, { contentType: ct, upsert: true })
      if (!error) { ok.push(s.domain); console.log(`  ✓ ${s.domain}  (${ct}, ${(bytes.byteLength / 1024) | 0}KB)`) }
      else { failed.push({ domain: s.domain, error: error.message }); console.log(`  ✗ ${s.domain} — ${error.message}`) }
    } catch (e) {
      failed.push({ domain: s.domain, error: String(e) })
      console.log(`  ✗ ${s.domain} — ${e}`)
    }
  }

  fs.writeFileSync(path.join(path.dirname(seedsPath), 'og-failures.json'), JSON.stringify(failed, null, 2))
  console.log(`\ndone — ${ok.length} rescued, ${failed.length} still failed`)
  if (failed.length) for (const f of failed) console.log(`  ${f.domain} — ${f.error}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
