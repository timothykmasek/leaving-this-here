// Backfill bookmarks.url_key for existing rows (migration 014).
//
// The live save paths write url_key on every new save, but rows saved before
// the column existed have it NULL — so a near-dupe of an OLD bullet wouldn't be
// caught until that old row is itself re-saved. This one-off fills them in.
//
// The normalizer below is an inline mirror of lib/normalizeUrl.ts — kept in
// sync by hand (it's small and stable). Validated against live data before use.
//
// Dry-run by default (counts only). Pass --apply to write.
//
//   node scripts/backfill-url-key.mjs           # dry run
//   node scripts/backfill-url-key.mjs --apply    # apply
//
// Run AFTER migration 014 has been applied in the Supabase SQL editor.
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

// --- inline mirror of lib/normalizeUrl.ts ---
const TRACKING_PARAM_PREFIXES = ['utm_']
const TRACKING_PARAMS = new Set([
  'utm', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'mc_cid', 'mc_eid', 'yclid', 'igshid', 'igsh',
  '_hsenc', '_hsmi', 'vero_id', 'vero_conv', 'oly_enc_id', 'oly_anon_id',
  'ck_subscriber_id', 'mkt_tok', 'twclid', 'ttclid', 'li_fat_id',
  '_ga', '_gl', 'srsltid', 'si',
  'ref_src', 'ref_url',
])
const TWITTER_HOSTS = /(^|\.)(x\.com|twitter\.com)$/
const TWITTER_ONLY_PARAMS = new Set(['s', 't'])
const isTrackingParam = (key, host) => {
  const k = key.toLowerCase()
  if (TRACKING_PARAMS.has(k)) return true
  if (TWITTER_HOSTS.test(host) && TWITTER_ONLY_PARAMS.has(k)) return true
  return TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p))
}
function normalizeUrl(input) {
  const raw = (input || '').trim()
  let u
  try { u = new URL(raw) } catch { return raw }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw
  const host = u.hostname.replace(/^www\./, '')
  const port = u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : ''
  let path = u.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  const params = new URLSearchParams(u.search)
  const kept = []
  for (const [k, v] of params) if (!isTrackingParam(k, host)) kept.push([k, v])
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
  const search = kept.length
    ? '?' + kept.map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join('&')
    : ''
  const isHashRoute = u.hash.startsWith('#/') || u.hash.startsWith('#!')
  const hash = isHashRoute ? u.hash : ''
  return `${protocolHttps()}//${host}${port}${path}${search}${hash}`
}
const protocolHttps = () => 'https:'
// --- end mirror ---

const apply = process.argv.includes('--apply')
// --recompute: also rewrite rows whose stored url_key no longer matches what
// normalizeUrl now produces (e.g. after adding tracking params to strip), not
// just the NULL ones.
const recompute = process.argv.includes('--recompute')

async function main() {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('bookmarks')
      .select('id, url, url_key')
      .order('created_at')
      .range(from, from + 999)
    if (error) throw error
    all = all.concat(data)
    if (data.length < 1000) break
    from += 1000
  }

  const toFill = all.filter((b) => {
    const key = normalizeUrl(b.url)
    return recompute ? b.url_key !== key : !b.url_key
  })
  console.log(
    `${all.length} bookmarks, ${toFill.length} ${recompute ? 'with stale/missing' : 'missing'} url_key`,
  )

  let written = 0
  for (const b of toFill) {
    const key = normalizeUrl(b.url)
    if (!apply) continue
    const { error } = await sb.from('bookmarks').update({ url_key: key }).eq('id', b.id)
    if (error) { console.error('  fail', b.id, error.message); continue }
    written++
  }

  console.log(apply ? `wrote url_key for ${written} rows` : 'dry run — pass --apply to write')
}

main().catch((e) => { console.error(e); process.exit(1) })
