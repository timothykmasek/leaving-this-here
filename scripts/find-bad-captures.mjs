// Find stored screenshots that are not screenshots of the page.
//
// lib/screenshot used to send ignore_host_errors=true, which told
// ScreenshotOne to capture 403s and CAPTCHA interstitials ANYWAY and hand them
// back as successful screenshots. So "confirm you are human" pages sit in the
// library as card images, indistinguishable from real captures by anything in
// the database. That flag is off now; this cleans up what it already made.
//
// TWO PASSES, because vision costs money and most captures are fine.
//
//   size   Free. Measured on known cases: walls and error pages came back at
//          20-25KB, real captures at 53-125KB. A bot wall is a nearly-empty
//          page and compresses to almost nothing. Not sufficient on its own —
//          Target's error page is 117KB because it carries the full site
//          chrome — but it narrows 1,200 images to a few hundred for free.
//
//   vision Haiku looks at each candidate and says whether it is the page or an
//          obstacle. Only runs on what the size pass flagged, and only with
//          --vision.
//
// A confirmed bad capture has its screenshot_url set to null. Nothing is
// deleted from storage and no other column is touched: the card simply falls
// through to CardFallback, which is built for this and looks deliberate.
//
//   node scripts/find-bad-captures.mjs                  # size pass, preview profiles
//   node scripts/find-bad-captures.mjs --all            # every user
//   node scripts/find-bad-captures.mjs --vision         # confirm with Haiku
//   node scripts/find-bad-captures.mjs --vision --apply # and clear them

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
const VISION = process.argv.includes('--vision')
const ALL = process.argv.includes('--all')
// Above this, a capture has enough going on to be a real page. Below it, it is
// a candidate — not a verdict.
const SIZE_FLOOR = 40 * 1024
const CONCURRENCY = 10

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '?' } }

// ── gather ──────────────────────────────────────────────────────────────────
let userFilter = null
if (!ALL) {
  const { data: profs } = await sb.from('profiles').select('id').eq('is_preview', true)
  userFilter = (profs || []).map((p) => p.id)
}
let rows = []
for (let from = 0; ; from += 1000) {
  let q = sb.from('bookmarks').select('id,url,title,screenshot_url,image_url')
    .not('screenshot_url', 'is', null).range(from, from + 999)
  if (userFilter) q = q.in('user_id', userFilter)
  const { data, error } = await q
  if (error) { console.error(error.message); process.exit(1) }
  rows = rows.concat(data || [])
  if (!data || data.length < 1000) break
}
console.log(`${rows.length} stored screenshots${ALL ? '' : ' on preview profiles'}\n`)

// ── pass 1: size ────────────────────────────────────────────────────────────
const sized = []
let cursor = 0
async function sizeWorker() {
  while (cursor < rows.length) {
    const b = rows[cursor++]
    let bytes = -1
    try {
      const r = await fetch(b.screenshot_url, { method: 'HEAD', signal: AbortSignal.timeout(9000) })
      bytes = Number(r.headers.get('content-length') || 0)
    } catch {}
    sized.push({ ...b, bytes })
    if (sized.length % 200 === 0) process.stdout.write(`  sized ${sized.length}/${rows.length}\n`)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, sizeWorker))

const candidates = sized.filter((b) => b.bytes >= 0 && b.bytes < SIZE_FLOOR)
const unreachable = sized.filter((b) => b.bytes < 0)
console.log(`\nunder ${Math.round(SIZE_FLOOR / 1024)}KB (candidates): ${candidates.length}`)
console.log(`unreachable                : ${unreachable.length}`)
console.log(`look fine on size          : ${sized.length - candidates.length - unreachable.length}`)

const byHost = {}
candidates.forEach((b) => { const h = host(b.url); byHost[h] = (byHost[h] || 0) + 1 })
console.log('\nmost-affected hosts:')
Object.entries(byHost).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([h, n]) => console.log(`  ${String(n).padStart(4)}  ${h}`))

if (!VISION) {
  console.log('\nSize pass only. Re-run with --vision to have Haiku confirm which of')
  console.log('these are genuinely obstacles rather than simply plain pages.')
  process.exit(0)
}

// ── pass 2: vision ──────────────────────────────────────────────────────────
const apiKey = env.ANTHROPIC_API_KEY
if (!apiKey) { console.error('\nANTHROPIC_API_KEY not in .env.local'); process.exit(1) }

const PROMPT = `This image is a screenshot captured for a link preview card.

Answer with ONE word:

OBSTACLE - the screenshot shows something standing between the visitor and the
page: a CAPTCHA, "verify you are human", "access denied", "checking your
browser", a cookie or consent wall covering everything, a login wall, a 404 or
"page not found", a server error, or a blank/near-blank page.

PAGE - the screenshot shows actual page content, even if plain, text-heavy,
sparse or ugly. A simple page is still the page.

One word only.`

async function classify(url) {
  try {
    const img = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!img.ok) return 'ERROR'
    const buf = Buffer.from(await img.arrayBuffer())
    const media = img.headers.get('content-type')?.split(';')[0] || 'image/webp'
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 8,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) return 'ERROR'
    const d = await res.json()
    const t = (d?.content?.[0]?.text || '').trim().toUpperCase()
    return t.startsWith('OBSTACLE') ? 'OBSTACLE' : t.startsWith('PAGE') ? 'PAGE' : 'ERROR'
  } catch { return 'ERROR' }
}

console.log(`\nasking Haiku about ${candidates.length} candidates…\n`)
const verdicts = { OBSTACLE: [], PAGE: [], ERROR: [] }
let vc = 0
async function visionWorker() {
  while (vc < candidates.length) {
    const b = candidates[vc++]
    const v = await classify(b.screenshot_url)
    verdicts[v].push(b)
    const done = verdicts.OBSTACLE.length + verdicts.PAGE.length + verdicts.ERROR.length
    if (done % 25 === 0) process.stdout.write(`  ${done}/${candidates.length}\n`)
  }
}
await Promise.all(Array.from({ length: 6 }, visionWorker))

console.log(`\nOBSTACLE (not the page): ${verdicts.OBSTACLE.length}`)
console.log(`PAGE     (keep)        : ${verdicts.PAGE.length}`)
console.log(`ERROR    (skipped)     : ${verdicts.ERROR.length}`)
console.log('\nobstacles:')
verdicts.OBSTACLE.slice(0, 25).forEach((b) =>
  console.log(`  ${String(Math.round(b.bytes / 1024)).padStart(4)}KB  ${host(b.url).slice(0, 30).padEnd(32)} ${(b.title || '').slice(0, 40)}`))
if (verdicts.OBSTACLE.length > 25) console.log(`  … and ${verdicts.OBSTACLE.length - 25} more`)

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to clear these,')
  console.log('which drops screenshot_url only; the card falls to CardFallback.')
  process.exit(0)
}

let cleared = 0
for (const b of verdicts.OBSTACLE) {
  const { error } = await sb.from('bookmarks').update({ screenshot_url: null }).eq('id', b.id)
  if (!error) cleared++
}
console.log(`\ncleared ${cleared} screenshot_url values. Storage untouched.`)
