// One-off inventory: how many bullets of each card_type exist, and how many
// carry a usable og image vs a screenshot. Grounds the per-type card work in
// real data (which templates actually earn their keep). Read-only.
//
//   node scripts/card-type-inventory.mjs
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

// Page through every bullet — card_type + whether each image source is present.
const has = (s) => typeof s === 'string' && s.length > 0
const rows = []
let from = 0
const PAGE = 1000
for (;;) {
  const { data, error } = await sb
    .from('bookmarks')
    .select('card_type, image_url, screenshot_url')
    .range(from, from + PAGE - 1)
  if (error) { console.error(error); process.exit(1) }
  if (!data || data.length === 0) break
  rows.push(...data)
  if (data.length < PAGE) break
  from += PAGE
}

const stat = new Map()
for (const r of rows) {
  const t = r.card_type || '(null)'
  const s = stat.get(t) || { total: 0, og: 0, shot: 0, neither: 0 }
  s.total++
  if (has(r.image_url)) s.og++
  if (has(r.screenshot_url)) s.shot++
  if (!has(r.image_url) && !has(r.screenshot_url)) s.neither++
  stat.set(t, s)
}

const sorted = [...stat.entries()].sort((a, b) => b[1].total - a[1].total)
const pad = (s, n) => String(s).padEnd(n)
const padl = (s, n) => String(s).padStart(n)
console.log(`\nTotal bullets: ${rows.length}\n`)
console.log(pad('card_type', 16), padl('total', 7), padl('og', 7), padl('shot', 7), padl('neither', 8))
console.log('-'.repeat(48))
for (const [t, s] of sorted) {
  console.log(pad(t, 16), padl(s.total, 7), padl(s.og, 7), padl(s.shot, 7), padl(s.neither, 8))
}
console.log('')
