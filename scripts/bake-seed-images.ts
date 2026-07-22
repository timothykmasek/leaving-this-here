// Bake onboarding seed picker images.
//
// Captures a screenshot for every seed link and stores it in Supabase Storage
// at `card-images/seed/<domain>.webp` — the exact path seedImageUrl() reads.
// Reuses the production capture path (captureAndStore), so the min-bytes /
// blank-capture guard and the same ScreenshotOne params apply.
//
// Required env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// SCREENSHOTONE_ACCESS_KEY.
//
//   npx tsx scripts/bake-seed-images.ts <seeds.json> [--only domain1,domain2]
//
// seeds.json = [{ domain, url, ... }]. Writes a failures report next to it.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { ensureBucket, storeImageBytes } from '../lib/screenshot'

const MIN_BYTES = 8000 // below this = blank/blocked capture (matches lib/screenshot)

// Capture bytes with cache DISABLED and no cache_ttl. We can't reuse
// screenshotApiUrl({fresh:true}) because it leaves cache_ttl in the query when
// cache=false, which ScreenshotOne rejects ("cache_ttl cannot be used when the
// cache option is false") — the same bug that breaks the prod force-recapture
// path. cache=false matters: with cache=true, ScreenshotOne served a stale 3648B
// blank for ~70% of these domains instead of rendering fresh.
async function captureBytes(url: string): Promise<{ bytes?: Uint8Array; error?: string }> {
  const key = process.env.SCREENSHOTONE_ACCESS_KEY!
  const params = new URLSearchParams({
    access_key: key,
    url,
    viewport_width: '1280',
    viewport_height: '900',
    format: 'webp',
    image_quality: '90',
    block_ads: 'true',
    block_cookie_banners: 'true',
    block_chats: 'true',
    reduced_motion: 'true',
    wait_until: 'networkidle2',
    delay: '2',
    cache: 'false',
    ignore_host_errors: 'true',
  })
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 60000)
    const res = await fetch(`https://api.screenshotone.com/take?${params}`, { signal: controller.signal })
    clearTimeout(t)
    const ct = res.headers.get('content-type') || ''
    if (!res.ok || !ct.startsWith('image/')) {
      let detail = `HTTP ${res.status}`
      try { const b = await res.json(); if (b?.error_message) detail = b.error_message } catch {}
      return { error: detail }
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes.byteLength < MIN_BYTES) return { error: `blank capture (${bytes.byteLength}B) — host blocks datacenter screenshots` }
    return { bytes }
  } catch (err) {
    return { error: `fetch failed: ${String(err)}` }
  }
}

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

const args = process.argv.slice(2)
const seedsPath = args.find((a) => !a.startsWith('--')) || 'seeds.json'
const onlyArg = (() => {
  const i = args.indexOf('--only')
  return i >= 0 && args[i + 1] ? new Set(args[i + 1].split(',')) : null
})()

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Seed = { domain: string; url: string; title: string }
let seeds: Seed[] = JSON.parse(fs.readFileSync(seedsPath, 'utf8'))
if (onlyArg) seeds = seeds.filter((s) => onlyArg.has(s.domain))

const CONCURRENCY = 4
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function main() {
  await ensureBucket(supabase)
  console.log(`baking ${seeds.length} seed images (concurrency ${CONCURRENCY})…\n`)

  const ok: string[] = []
  const failed: { domain: string; url: string; error: string }[] = []
  const queue = [...seeds]
  let done = 0

  async function worker() {
    while (queue.length) {
      const s = queue.shift()!
      // one retry — transient ScreenshotOne timeouts/limits happen on a burst.
      let cap = await captureBytes(s.url)
      if (cap.error && /limit|429|timeout|fetch failed/i.test(cap.error)) {
        await sleep(3000)
        cap = await captureBytes(s.url)
      }
      const res = cap.bytes
        ? await storeImageBytes(supabase, `seed/${s.domain}`, cap.bytes, 'image/webp')
        : { publicUrl: null as string | null, error: cap.error || 'unknown' }
      done++
      if (res.publicUrl) {
        ok.push(s.domain)
        console.log(`  ✓ ${String(done).padStart(3)}/${seeds.length}  ${s.domain}`)
      } else {
        failed.push({ domain: s.domain, url: s.url, error: res.error || 'unknown' })
        console.log(`  ✗ ${String(done).padStart(3)}/${seeds.length}  ${s.domain} — ${res.error}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  const report = path.join(path.dirname(seedsPath), 'bake-failures.json')
  fs.writeFileSync(report, JSON.stringify(failed, null, 2))
  console.log(`\ndone — ${ok.length} ok, ${failed.length} failed`)
  if (failed.length) {
    console.log('failures:')
    for (const f of failed) console.log(`  ${f.domain} — ${f.error}`)
    console.log(`\nfailure report: ${report}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
