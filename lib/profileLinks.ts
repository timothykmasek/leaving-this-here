// Profile social links. Historically `profiles.links` was a fixed-key object
// ({ twitter, linkedin, website, … }); the free-form editor stores an ORDERED
// array of urls instead (jsonb objects sort their keys, arrays keep order).
// Everything that reads links goes through normalizeProfileLinks so both
// shapes render identically — no backfill needed.

export type LinkPlatform =
  | 'x'
  | 'linkedin'
  | 'instagram'
  | 'tiktok'
  | 'substack'
  | 'youtube'
  | 'website'

// Legacy object keys, in the order the identity row always showed them.
const LEGACY_ORDER = ['twitter', 'instagram', 'substack', 'linkedin', 'website']

export function normalizeProfileLinks(
  links: Record<string, string> | string[] | null | undefined
): string[] {
  if (!links) return []
  if (Array.isArray(links)) return links.filter((u) => typeof u === 'string' && u.trim())
  return LEGACY_ORDER.map((k) => links[k]).filter(Boolean)
}

export function detectPlatform(url: string): LinkPlatform {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return 'website'
  }
  if (host === 'x.com' || host === 'twitter.com') return 'x'
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) return 'linkedin'
  if (host === 'instagram.com' || host.endsWith('.instagram.com')) return 'instagram'
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
  if (host === 'substack.com' || host.endsWith('.substack.com')) return 'substack'
  if (host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be')
    return 'youtube'
  return 'website'
}

// "https://www.instagram.com/timmasek/" → "instagram.com/timmasek"
export function linkLabel(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
}

// Editor input → a storable url, or null when it can't be one. Bare domains
// get https:// so "instagram.com/scott" pastes straight in.
export function coerceUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const u = new URL(withScheme)
    // A hostname needs a dot ("instagram" alone isn't a link yet).
    if (!u.hostname.includes('.')) return null
    return u.href
  } catch {
    return null
  }
}
