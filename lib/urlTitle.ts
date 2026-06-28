// URL-derived titles for sites whose scraped HTML is unreliable.
//
// Google Maps serves a generic "Google Maps" title to a plain fetch, and Amazon
// bot-blocks (leaking "Follow the author" and similar button text). But both
// encode the real name in the URL itself — the place name in /maps/place/<name>
// and the product slug in /<slug>/dp/<asin>. These are more trustworthy than
// whatever the blocked HTML returns, so the title picker prefers them.

/** True for Google Maps short links that need redirect resolution to expose
 *  the real /maps/place/<name> URL. */
export function isMapsShortLink(url: string): boolean {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\./, '')
    if (h === 'maps.app.goo.gl') return true
    if (h === 'goo.gl' && u.pathname.startsWith('/maps')) return true
    return false
  } catch {
    return false
  }
}

/** Place name from a Google Maps URL path, e.g. /maps/place/Cabo+Espichel/… */
export function mapsPlaceTitle(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (!host.includes('google.') || !u.pathname.includes('/maps/place/')) return null
    const m = u.pathname.match(/\/maps\/place\/([^/@]+)/)
    if (!m) return null
    const name = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim()
    // Reject coordinate-only / data blobs that aren't real names.
    if (!name || name.length < 2 || /^[-\d.,\s]+$/.test(name)) return null
    return name
  } catch {
    return null
  }
}

/** Product name from an Amazon URL slug, e.g. /Many-Lives-Mama-Love/dp/198219… */
export function amazonSlugTitle(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('amazon.')) return null
    const m = u.pathname.match(/\/([^/]+)\/(?:dp|gp\/product)\//)
    if (!m) return null
    const slug = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim()
    // Reject ASIN-shaped or too-short slugs (no real words).
    if (slug.length < 4 || !/[a-z]/i.test(slug) || /^[0-9a-z]{10}$/i.test(slug)) return null
    // Title-case the slug words.
    return slug.replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return null
  }
}

/** Post title from a Reddit URL slug, e.g. /comments/<id>/bowery_farming_to_… */
export function redditSlugTitle(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.replace(/^www\./, '').endsWith('reddit.com')) return null
    const m = u.pathname.match(/\/comments\/[a-z0-9]+\/([^/]+)/i)
    if (!m) return null
    const s = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim()
    if (s.length < 4) return null
    // Reddit slugs are sentence-shaped — capitalize the first letter only.
    return s.charAt(0).toUpperCase() + s.slice(1)
  } catch {
    return null
  }
}

/** Product name from an Etsy listing slug, e.g. /listing/<id>/personalized-… */
export function etsySlugTitle(url: string): string | null {
  try {
    const u = new URL(url)
    if (!u.hostname.includes('etsy.com')) return null
    const m = u.pathname.match(/\/listing\/\d+\/([^/]+)/)
    if (!m) return null
    const s = decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim()
    if (s.length < 4) return null
    return s.replace(/\b\w/g, (c) => c.toUpperCase())
  } catch {
    return null
  }
}

/** The best URL-derived title, if any (Maps place, Amazon/Etsy slug, Reddit). */
export function urlDerivedTitle(originalUrl: string, resolvedUrl?: string | null): string | null {
  const resolved = resolvedUrl || originalUrl
  return (
    mapsPlaceTitle(resolved) ||
    mapsPlaceTitle(originalUrl) ||
    amazonSlugTitle(originalUrl) ||
    amazonSlugTitle(resolved) ||
    redditSlugTitle(originalUrl) ||
    etsySlugTitle(originalUrl)
  )
}
