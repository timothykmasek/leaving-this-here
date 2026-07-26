// Free backfill for the card-visual quality gate — no re-capture, no credits.
//
// Clears screenshot_url to the '' sentinel (which pickCardImage treats as
// "fall back to og:image / plate") for existing bad screenshots across ALL
// users, using the same cheap rules the live pipeline now enforces:
//   1. Host is a login/permission wall (Google Docs, Drive, auth) — can only
//      ever have captured a "Sign in" page. Mirrors shouldSkipScreenshot()
//      in lib/cardImage.ts.
//   2. Stored raw_metadata.htmlTitle looks like a block/challenge/parked page.
//      Mirrors looksLikeBadPageTitle() in lib/cardType.ts.
//
// Dry-run by default (counts only). Pass --apply to write.
//
//   node scripts/backfill-card-quality.mjs          # dry run
//   node scripts/backfill-card-quality.mjs --apply   # apply
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

// --- mirrors lib/cardImage.ts SKIP_SCREENSHOT_HOSTS ---
const SKIP_HOSTS = [
  'docs.google.com', 'drive.google.com', 'accounts.google.com',
  'sheets.google.com', 'slides.google.com', 'forms.gle',
  'login.microsoftonline.com',
]
const SKIP_PATHS = /(^|\/)(checkout|cart|login|signin|sign-in|signup|sign-up|account\/login)(\/|$)/i
const shouldSkipScreenshot = (url) => {
  try { const u = new URL(url); const h = u.hostname.replace(/^www\./, ''); return SKIP_HOSTS.some((d) => h === d || h.endsWith('.' + d)) || SKIP_PATHS.test(u.pathname) } catch { return false }
}
// --- mirrors lib/cardType.ts BAD_PAGE_TITLE_SIGNALS ---
const BAD_TITLE = [
  'you have been blocked', 'attention required!', 'just a moment', 'access denied',
  'access to this page has been denied', '403 forbidden', 'are you a robot',
  'security check', 'verifying you are human', 'welcome to nginx',
  'apache2 ubuntu default page', 'index of /', 'account suspended',
  'this domain is for sale', 'domain for sale', 'buy this domain', 'sign in to continue',
  'page not found', 'page could not be found', "page doesn't exist",
  'page cannot be found', '404 not found',
]
const looksLikeBadPageTitle = (t) => { if (!t) return false; const l = String(t).toLowerCase(); return BAD_TITLE.some((s) => l.includes(s)) }

// A row currently shows a screenshot worth clearing if screenshot_url is a real
// value (not null, not the '' sentinel).
const hasScreenshot = (u) => typeof u === 'string' && u.length > 0

const { data: profs } = await sb.from('profiles').select('id,username')
const nameOf = Object.fromEntries((profs || []).map((p) => [p.id, p.username]))

let all = [], from = 0
while (true) {
  const { data, error } = await sb
    .from('bookmarks')
    .select('id,user_id,url,screenshot_url,raw_metadata')
    .range(from, from + 999)
  if (error) { console.error(error); process.exit(1) }
  all = all.concat(data)
  if (data.length < 1000) break
  from += 1000
}

const toClear = [] // { id, user, reason }
for (const b of all) {
  // Host rule: clear whenever it currently has a screenshot, and also pre-empt
  // future captures if one is queued (null). Skip rows already sentineled ('').
  if (shouldSkipScreenshot(b.url)) {
    if (b.screenshot_url !== '') toClear.push({ id: b.id, user: nameOf[b.user_id], reason: 'login-wall host' })
    continue
  }
  // Title rule: only meaningful when there's a screenshot to clear.
  if (hasScreenshot(b.screenshot_url) && looksLikeBadPageTitle(b.raw_metadata?.htmlTitle)) {
    toClear.push({ id: b.id, user: nameOf[b.user_id], reason: 'bad-page title' })
  }
}

// Report
const byReason = {}, byUser = {}
for (const r of toClear) {
  byReason[r.reason] = (byReason[r.reason] || 0) + 1
  byUser[r.user] = (byUser[r.user] || 0) + 1
}
console.log(`scanned ${all.length} bookmarks (all users)`)
console.log(`would clear ${toClear.length} screenshot(s) -> '' sentinel${APPLY ? ' [APPLYING]' : ' [DRY RUN]'}`)
console.log('by reason:', byReason)
console.log('by user:', byUser)

if (!APPLY) {
  console.log('\nrun again with --apply to write.')
  process.exit(0)
}

let done = 0, failed = 0
for (const r of toClear) {
  const { error } = await sb.from('bookmarks').update({ screenshot_url: '' }).eq('id', r.id)
  if (error) { failed++; console.error('  fail', r.id, error.message) } else done++
}
console.log(`\napplied: cleared ${done}, failed ${failed}`)
