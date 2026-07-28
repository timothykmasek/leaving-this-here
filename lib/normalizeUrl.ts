// Compute a normalized *dedupe key* for a saved URL.
//
// This is NOT the URL we store or link to — that stays exactly as the user
// saved it (forcing https, dropping `www.`, or stripping a fragment can break a
// real link, and hash-routed SPAs carry their route in the fragment). The key
// exists only to answer "have I already saved essentially this page?" so the
// unique index on (user_id, url_key) collapses the common near-duplicates:
// trailing slash, http/https, www, tracking params, param order.
//
// It deliberately does NOT merge locale/path variants (`/en` vs `/en-uk`) —
// those are genuinely different pages and only a fuzzy content match could tell
// they're the same, at the cost of false merges.

// Query params that are pure tracking/analytics — they never change which page
// you land on, so two saves that differ only by a campaign tag are one bullet.
// Kept conservative on purpose: generic keys like `ref`/`source`/`id` are left
// alone because real pages use them to select content.
const TRACKING_PARAM_PREFIXES = ['utm_']
const TRACKING_PARAMS = new Set([
  'utm', 'fbclid', 'gclid', 'gclsrc', 'dclid', 'gbraid', 'wbraid',
  'msclkid', 'mc_cid', 'mc_eid', 'yclid', 'igshid', 'igsh',
  '_hsenc', '_hsmi', 'vero_id', 'vero_conv', 'oly_enc_id', 'oly_anon_id',
  'ck_subscriber_id', 'mkt_tok', 'twclid', 'ttclid', 'li_fat_id',
  '_ga', '_gl', 'oly_anon_id', 'srsltid', 'si',
])

function isTrackingParam(key: string): boolean {
  const k = key.toLowerCase()
  if (TRACKING_PARAMS.has(k)) return true
  return TRACKING_PARAM_PREFIXES.some((p) => k.startsWith(p))
}

export function normalizeUrl(input: string): string {
  const raw = (input || '').trim()
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    // Not a parseable absolute URL — key on the trimmed string so we still
    // dedupe exact repeats without inventing structure.
    return raw
  }

  // Only normalize web URLs; leave anything exotic (mailto:, etc.) as-is.
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw

  // Scheme: collapse http/https for the key.
  const protocol = 'https:'

  // Host: lowercase (URL already lowercases host) and drop a leading www.
  const host = u.hostname.replace(/^www\./, '')

  // Port: drop default ports.
  const port =
    u.port && u.port !== '80' && u.port !== '443' ? `:${u.port}` : ''

  // Path: strip a single trailing slash but keep root "/". Case preserved —
  // paths can be case-sensitive.
  let path = u.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)

  // Query: drop tracking params, then sort the rest for a stable key.
  const params = new URLSearchParams(u.search)
  const kept: [string, string][] = []
  for (const [k, v] of params) {
    if (!isTrackingParam(k)) kept.push([k, v])
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1))
  const search = kept.length
    ? '?' + kept.map(([k, v]) => (v === '' ? k : `${k}=${v}`)).join('&')
    : ''

  // Fragment: dropped from the key UNLESS it's a hash route (`#/…` or `#!…`),
  // where it actually selects the page.
  const isHashRoute = u.hash.startsWith('#/') || u.hash.startsWith('#!')
  const hash = isHashRoute ? u.hash : ''

  return `${protocol}//${host}${port}${path}${search}${hash}`
}
