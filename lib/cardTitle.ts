// Card title formatting — normalize the raw page <title> into a consistent
// `Brand — what it is` shape so the board reads as one voice instead of whatever
// each site's SEO team happened to type.
//
// The raw title arrives in three shapes and we collapse them all:
//   "RONNING | Everyday Uniform"  (brand + tagline) → normalize separator
//   "Crosby"                      (bare brand)      → append a short descriptor
//   "Upgrade Your Sock Drawer"    (bare tagline)    → prepend the brand
//
// Fully deterministic: brand comes from og:site_name (or the domain), the
// descriptor from the stored description. No network, no LLM — safe to run at
// render time over already-stored data, so it fixes every existing card with no
// backfill and never clobbers a user's hand-edited title in the database.

// Split on the separators sites use between brand and tagline.
const SEP = /\s*[|•·▪‧・—–]\s*|\s+[-]\s+/

// Second-level "domain-like" labels to skip when deriving a brand from the host,
// so bbc.co.uk → "Bbc", not "Co".
const PUBLIC_SLDS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac'])

// Titles that carry no information — fall back to the brand/domain instead.
// Also filtered out per-segment: Shopify and friends serve datacenter fetchers
// titles like "Your cart – Areaware", and the cart half is site state, not the
// page. Applied at render time, so already-stored junk heals with no backfill.
const GENERIC = new Set([
  'home', 'homepage', 'index', 'landing', 'untitled', 'welcome',
  'login', 'log in', 'sign in', 'loading', 'page not found', 'not found',
  'cart', 'your cart', 'shopping cart', 'shopping bag', 'your bag', 'checkout',
  'access denied', 'attention required', 'just a moment', 'error',
])

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Normalize a brand token for comparison, and strip common startup affixes so
// "Basis" matches the domain getbasis.ai, "Notion" matches trynotion.com, etc.
function normToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}
function stripAffix(s: string): string {
  return s
    .replace(/^(get|try|use|join|my|go|hey|meet|with|the|on)(?=.{3,})/, '')
    .replace(/(?<=.{3,})(app|hq|labs|inc)$/, '')
}
/** True if `seg` is the brand — exact, affix-stripped, or containment match. */
function brandMatch(seg: string, candidate: string | null | undefined): boolean {
  if (!candidate) return false
  const a = normToken(seg)
  const b = normToken(candidate)
  if (!a || !b) return false
  if (a === b) return true
  const as = stripAffix(a)
  const bs = stripAffix(b)
  if (as && bs && as === bs) return true
  // One fully contains the other (both reasonably long) — "basis" ⊂ "getbasis".
  if (a.length >= 4 && b.length >= 4 && (b.includes(a) || a.includes(b))) return true
  return false
}

/** Brand from the host: the registrable label, title-cased. sunrun.com → "Sunrun". */
function brandFromUrl(url: string): string | null {
  const host = getDomain(url)
  const parts = host.split('.')
  if (parts.length < 2) return null
  let i = parts.length - 2
  if (i > 0 && PUBLIC_SLDS.has(parts[i])) i -= 1 // bbc.co.uk → bbc
  const label = parts[i]
  if (!label) return null
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Clean an og:site_name into a usable brand, or null if it's junk. */
function cleanSiteName(siteName?: string | null): string | null {
  if (!siteName) return null
  const first = siteName.split(SEP)[0]?.trim()
  if (!first || first.length > 30) return null
  if (GENERIC.has(first.toLowerCase())) return null
  if (/^@/.test(first)) return null // twitter handle, not a brand
  return first
}

/**
 * A short "what it is" from the description: first sentence, brand mention
 * stripped, capped at a word boundary.
 */
function shortDescriptor(description: string | null | undefined, brand: string | null): string | null {
  if (!description) return null
  let d = description.trim().replace(/\s+/g, ' ')
  if (!d) return null

  // First sentence only.
  d = d.split(/(?<=[.!?])\s/)[0] || d

  // Drop a leading brand mention ("Crosby is …", "Crosby: …", "Crosby —").
  // Try the full brand, then its first word — og:site_name is often longer
  // than how the copy refers to itself ("Areaware Retail" vs "Areaware is…").
  if (brand) {
    for (const candidate of [brand, brand.split(/\s+/)[0]]) {
      if (!candidate || candidate.length < 3) continue
      const b = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const next = d.replace(new RegExp(`^${b}\\s*(?:is|:|—|–|-|,)?\\s*`, 'i'), '').trim()
      if (next !== d) { d = next; break }
    }
  }

  // Cap at a word boundary.
  const CAP = 52
  if (d.length > CAP) d = d.slice(0, CAP).replace(/\s+\S*$/, '') + '…'
  // Trim dangling punctuation (keep a trailing ellipsis).
  d = d.replace(/[.,;:—–-]+$/, '').trim()
  if (!d) return null
  // Uppercase the first letter for a titley feel.
  return d.charAt(0).toUpperCase() + d.slice(1)
}

// Browser-tab notification badges leak into extension-captured titles —
// "(9+) Instagram", "(2) WhatsApp". That's tab state, not the page title.
const TAB_BADGE = /^\(\d+\+?\)\s*/

// Instagram's metadata is junk for profile pages: the title is just
// "Instagram" (plus a tab badge), and the description is either login-wall
// copy or a follower-stats dump. The good part — the account — hides inside
// that stats string ("… from NATURE TALKS (@handle)") or in the URL path.
// Rebuild `Instagram — <account>` from those instead.
const IG_PATH_NOT_A_HANDLE = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'tv',
])
// Machine-generated Instagram title shapes. Anything else is either a user's
// hand-edit or already-good data — leave those to the generic formatter.
const IG_JUNK_TITLE = /^(instagram)?$|• Instagram photos and videos/i

function instagramTitle(url: string, title?: string | null, description?: string | null): string | null {
  if (getDomain(url) !== 'instagram.com') return null
  const raw = (title || '').replace(TAB_BADGE, '').trim()
  if (raw && !IG_JUNK_TITLE.test(raw)) return null

  // Best source: the real og:title, "NAME (@handle) • Instagram photos and
  // videos" or "handle • Instagram photos and videos".
  const lead = raw.replace(/\s*[•·]\s*Instagram photos and videos.*$/i, '').trim()
  if (lead && !/^instagram$/i.test(lead)) {
    const m = lead.match(/^(.+?)\s*\(@[\w.]+\)$/)
    return `Instagram — ${m ? m[1] : lead}`
  }
  // Next: the stats description, "… from NAME (@handle)" / "… from @handle".
  let m = (description || '').match(/from (.{1,40}?) \(@[\w.]+\)/)
  if (m) return `Instagram — ${m[1]}`
  m = (description || '').match(/from @([\w.]+)/)
  if (m) return `Instagram — @${m[1]}`
  // Last: the @handle straight from a profile URL.
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean)[0]
    if (seg && !IG_PATH_NOT_A_HANDLE.has(seg.toLowerCase())) {
      return `Instagram — @${seg}`
    }
  } catch {}
  return null
}

// X/Twitter machine titles arrive as "NAME (@handle) on X" (our extension
// capture) or `NAME on X: "…"` (their og). Lead with the platform like every
// other card: `X — NAME (@handle)`. Anything else is a hand-edit → generic path.
function xTitle(url: string, title?: string | null): string | null {
  const d = getDomain(url)
  if (d !== 'x.com' && d !== 'twitter.com') return null
  const raw = (title || '').replace(TAB_BADGE, '').trim()
  const m = raw.match(/^(.{1,60}?) on (?:X|Twitter)(?::.*)?$/)
  return m ? `X — ${m[1]}` : null
}

export interface CardTitleInput {
  title?: string | null
  description?: string | null
  url: string
  siteName?: string | null
}

/**
 * Format a card title as `Brand — what it is`. Always leads with the brand.
 * Falls back to the domain when there's no usable title or brand.
 */
export function formatCardTitle({ title, description, url, siteName }: CardTitleInput): string {
  const ig = instagramTitle(url, title, description)
  if (ig) return ig
  const xt = xTitle(url, title)
  if (xt) return xt

  const domain = getDomain(url)
  const domainBrand = brandFromUrl(url)
  const brand = cleanSiteName(siteName) || domainBrand

  // Strip tab badges and dangling separator punctuation — stored titles like
  // "Your cart -" (Shopify cart <title>, trailing hyphen and all) must land in
  // the GENERIC check, not survive as an "informative" segment.
  const raw = (title || '')
    .trim()
    .replace(TAB_BADGE, '')
    .replace(/^[\s|•·—–-]+|[\s|•·—–-]+$/g, '')
  if (!raw || /^https?:\/\//i.test(raw) || GENERIC.has(raw.toLowerCase())) {
    if (!brand) return domain
    const d = shortDescriptor(description, brand)
    return d ? `${brand} — ${d}` : brand
  }
  if (!brand) return raw

  const segs = raw.split(SEP).map((s) => s.trim()).filter(Boolean)
  // A segment counts as "the brand" if it matches the chosen brand or the domain
  // root — affix-aware, so a bare-brand title like "Basis" on getbasis.ai is
  // recognized as the brand instead of being mistaken for a tagline.
  const idx = segs.findIndex((s) => brandMatch(s, brand) || brandMatch(s, domainBrand))

  if (idx !== -1) {
    // Brand is already in the title — lead with it (keeping its own casing),
    // then the rest (minus generic junk segments like "Your cart"). If nothing
    // informative remains, add a descriptor.
    const brandText = segs[idx]
    const rest = segs.filter((s, i) => i !== idx && !GENERIC.has(s.toLowerCase()))
    if (rest.length === 0) {
      const d = shortDescriptor(description, brandText)
      return d ? `${brandText} — ${d}` : brandText
    }
    return `${brandText} — ${rest.join(' — ')}`
  }

  // Brand absent from the title — prepend it (minus generic junk segments).
  const informative = segs.filter((s) => !GENERIC.has(s.toLowerCase()))
  if (informative.length === 0) {
    const d = shortDescriptor(description, brand)
    return d ? `${brand} — ${d}` : brand
  }
  return `${brand} — ${informative.join(' — ')}`
}
