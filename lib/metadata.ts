// Shared metadata extraction — used by both fetch-metadata API and backfill.
//
// Two-layer design:
//   1. extractRawMetadata(html, url): parses HTML into a raw JSON blob that
//      captures *every* signal we might care about (og:*, twitter:*, JSON-LD,
//      <title>, <h1>, icons). This is what gets stored in the DB.
//   2. pickBestTitle(raw, url) / pickBestImage(raw, url): pure functions that
//      turn the raw blob into the final winning values. Changing these does
//      NOT require refetching — we can re-run them over stored raw_metadata.

export interface RawMetadata {
  og: Record<string, string>
  twitter: Record<string, string>
  jsonLd: any[]
  metaName: Record<string, string>
  htmlTitle: string | null
  firstH1: string | null
  icons: string[]
  url: string
}

export interface ProductInfo {
  name: string | null
  image: string | null
  price: number | null
  currency: string | null
  priceFormatted: string | null
}

export interface MetadataResult {
  title: string | null
  image: string | null
  description: string | null
  siteName: string | null
  favicon: string | null
  product: ProductInfo | null
  raw: RawMetadata | null
}

// ── HTML fetch ──────────────────────────────────────────────────────

export async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    })

    if (!response.ok) return ''
    return await response.text()
  } catch {
    return ''
  } finally {
    clearTimeout(timeoutId)
  }
}

// ── Low-level extractors ────────────────────────────────────────────

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Extract all meta tags matching a given prefix (e.g. "og:" or "twitter:")
 * into a flat key->value map. Handles both attribute orders and prefixes.
 */
function extractMetaPrefix(html: string, prefix: 'og' | 'twitter'): Record<string, string> {
  const result: Record<string, string> = {}

  // Match any <meta ...> tag, then we'll inspect its attrs.
  const metaTagRegex = /<meta\s+([^>]+?)\s*\/?>/gi
  let match: RegExpExecArray | null
  while ((match = metaTagRegex.exec(html)) !== null) {
    const attrs = match[1]

    // Extract property= or name=
    const propMatch = attrs.match(/(?:property|name)=["']([^"']+)["']/i)
    if (!propMatch) continue
    const prop = propMatch[1].toLowerCase()
    if (!prop.startsWith(`${prefix}:`)) continue

    // Extract content=
    const contentMatch = attrs.match(/content=["']([^"']*)["']/i)
    if (!contentMatch) continue
    const content = decodeHtmlEntities(contentMatch[1]).trim()
    if (!content) continue

    // Strip the prefix: "og:title" → "title", "og:image:width" → "image:width"
    const key = prop.slice(prefix.length + 1)
    // First occurrence wins (og:image > og:image for multi-image pages)
    if (!(key in result)) result[key] = content
  }

  return result
}

/**
 * Extract all <meta name="..."> tags that aren't og:/twitter: (description, author, etc.)
 */
function extractMetaNames(html: string): Record<string, string> {
  const result: Record<string, string> = {}
  const regex = /<meta\s+([^>]+?)\s*\/?>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1]
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i)
    if (!nameMatch) continue
    const name = nameMatch[1].toLowerCase()
    if (name.startsWith('og:') || name.startsWith('twitter:')) continue
    const contentMatch = attrs.match(/content=["']([^"']*)["']/i)
    if (!contentMatch) continue
    const content = decodeHtmlEntities(contentMatch[1]).trim()
    if (!content) continue
    if (!(name in result)) result[name] = content
  }
  return result
}

function extractHtmlTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1]).trim() || null : null
}

function extractFirstH1(html: string): string | null {
  // Strip inner tags from h1 content (e.g. <h1><span>foo</span> bar</h1>)
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (!match?.[1]) return null
  const text = match[1].replace(/<[^>]+>/g, '').trim()
  return text ? decodeHtmlEntities(text) : null
}

function extractIcons(html: string): string[] {
  const icons: string[] = []
  const regex = /<link\s+([^>]+?)\s*\/?>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    const attrs = match[1]
    const relMatch = attrs.match(/rel=["']([^"']+)["']/i)
    if (!relMatch) continue
    const rel = relMatch[1].toLowerCase()
    if (!rel.includes('icon')) continue
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i)
    if (!hrefMatch) continue
    icons.push(hrefMatch[1])
  }
  return icons
}

function extractJsonLd(html: string): any[] {
  const results: any[] = []
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim())
      results.push(parsed)
    } catch {
      // Ignore malformed JSON-LD
    }
  }
  return results
}

// ── Raw metadata extraction ─────────────────────────────────────────

export function extractRawMetadata(html: string, url: string): RawMetadata {
  return {
    og: extractMetaPrefix(html, 'og'),
    twitter: extractMetaPrefix(html, 'twitter'),
    jsonLd: extractJsonLd(html),
    metaName: extractMetaNames(html),
    htmlTitle: extractHtmlTitle(html),
    firstH1: extractFirstH1(html),
    icons: extractIcons(html),
    url,
  }
}

// ── Smart pickers (pure — can re-run over stored raw_metadata) ──────

function resolveUrl(href: string, baseUrl: string): string {
  if (href.startsWith('http')) return href
  if (href.startsWith('//')) return 'https:' + href
  try {
    const base = new URL(baseUrl)
    if (href.startsWith('/')) return `${base.protocol}//${base.hostname}${href}`
    return `${base.protocol}//${base.hostname}/${href}`
  } catch {
    return href
  }
}

function getHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Strip trailing " | Site Name" or " - Site Name" suffixes from a title.
 */
function stripSiteSuffix(title: string, siteName: string | null | undefined): string {
  if (!siteName) return title
  const cleaned = siteName.trim()
  if (!cleaned) return title
  const patterns = [
    new RegExp(`\\s*[|\\-–—]\\s*${escapeRegex(cleaned)}\\s*$`, 'i'),
    new RegExp(`^${escapeRegex(cleaned)}\\s*[|\\-–—]\\s*`, 'i'),
  ]
  let result = title
  for (const p of patterns) result = result.replace(p, '')
  return result.trim() || title
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pick the best title from a raw metadata blob.
 *
 * Priority chain:
 *   1. og:title (if meaningful)
 *   2. twitter:title
 *   3. JSON-LD headline / name
 *   4. <h1>
 *   5. <title> (with site suffix stripped)
 *   6. null
 *
 * A title is "meaningful" if it exists, is >2 chars, and is NOT just the
 * site_name / brand abbreviation. This is what fixes the "BI" bug.
 */
export function pickBestTitle(raw: RawMetadata | null): string | null {
  if (!raw) return null

  const siteName =
    raw.og['site_name'] ||
    raw.twitter['site'] ||
    null

  const isMeaningful = (t: string | null | undefined): t is string => {
    if (!t) return false
    const trimmed = t.trim()
    if (trimmed.length < 3) return false
    // Reject if title is just the site name (case-insensitive)
    if (siteName && trimmed.toLowerCase() === siteName.toLowerCase().trim()) return false
    // Reject if title is just the hostname
    const host = getHostname(raw.url)
    if (host && trimmed.toLowerCase() === host.toLowerCase()) return false
    // Reject obviously-generic titles
    const generic = ['home', 'homepage', 'index', 'landing', 'untitled']
    if (generic.includes(trimmed.toLowerCase())) return false
    return true
  }

  const candidates: Array<string | null | undefined> = [
    raw.og['title'],
    raw.twitter['title'],
    extractJsonLdText(raw.jsonLd, ['headline', 'name']),
    raw.firstH1,
    raw.htmlTitle,
  ]

  for (const c of candidates) {
    if (isMeaningful(c)) {
      return stripSiteSuffix(c.trim(), siteName)
    }
  }

  // Last-resort fallback: return htmlTitle even if it matches site name — better than nothing
  if (raw.htmlTitle) return stripSiteSuffix(raw.htmlTitle.trim(), siteName)
  return null
}

function extractJsonLdText(jsonLd: any[], keys: string[]): string | null {
  for (const entry of jsonLd) {
    const items = Array.isArray(entry) ? entry : [entry]
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      for (const key of keys) {
        const val = item[key]
        if (typeof val === 'string' && val.trim()) return val.trim()
      }
      // Handle @graph
      if (Array.isArray(item['@graph'])) {
        const nested = extractJsonLdText(item['@graph'], keys)
        if (nested) return nested
      }
    }
  }
  return null
}

/**
 * Pick the best image URL from a raw metadata blob.
 *
 * Priority chain:
 *   1. og:image (if not a logo-shaped image)
 *   2. twitter:image
 *   3. JSON-LD image
 *   4. null
 *
 * An image is rejected as "logo-shaped" if the URL strongly suggests it's
 * a logo/icon (filename contains "logo", "icon", "favicon", "brand").
 * We can't check actual dimensions without fetching, so we rely on url
 * heuristics and og:image:width if present.
 */
export function pickBestImage(raw: RawMetadata | null): string | null {
  if (!raw) return null

  const looksLikeLogo = (urlStr: string): boolean => {
    const lower = urlStr.toLowerCase()
    if (/\b(logo|favicon|brandmark|wordmark|sprite)\b/.test(lower)) return true
    if (/\/(icons?|logos?|brand)\//.test(lower)) return true
    return false
  }

  const hasGoodDimensions = (width?: string, height?: string): boolean | null => {
    const w = width ? parseInt(width, 10) : NaN
    const h = height ? parseInt(height, 10) : NaN
    if (isNaN(w) || isNaN(h)) return null
    // Reject anything smaller than 400px on either side
    if (w < 400 || h < 400) return false
    // Reject extreme aspect ratios (squarish logos under 600px often look bad)
    const ratio = w / h
    if (w < 600 && Math.abs(ratio - 1) < 0.15) return false
    return true
  }

  // Candidate 1: og:image with dimensions
  const ogImage = raw.og['image']
  if (ogImage && !looksLikeLogo(ogImage)) {
    const dimsOk = hasGoodDimensions(raw.og['image:width'], raw.og['image:height'])
    if (dimsOk !== false) return resolveUrl(ogImage, raw.url)
  }

  // Candidate 2: twitter:image
  const twImage = raw.twitter['image']
  if (twImage && !looksLikeLogo(twImage)) {
    return resolveUrl(twImage, raw.url)
  }

  // Candidate 3: JSON-LD image
  const jsonLdImg = extractJsonLdImage(raw.jsonLd)
  if (jsonLdImg && !looksLikeLogo(jsonLdImg)) {
    return resolveUrl(jsonLdImg, raw.url)
  }

  // Fallback: og:image even if it looks like a logo (better than nothing)
  if (ogImage) return resolveUrl(ogImage, raw.url)
  if (twImage) return resolveUrl(twImage, raw.url)

  return null
}

function extractJsonLdImage(jsonLd: any[]): string | null {
  for (const entry of jsonLd) {
    const items = Array.isArray(entry) ? entry : [entry]
    for (const item of items) {
      if (!item || typeof item !== 'object') continue
      const img = item.image
      if (typeof img === 'string') return img
      if (Array.isArray(img) && typeof img[0] === 'string') return img[0]
      if (img && typeof img === 'object' && typeof img.url === 'string') return img.url
      if (Array.isArray(item['@graph'])) {
        const nested = extractJsonLdImage(item['@graph'])
        if (nested) return nested
      }
    }
  }
  return null
}

/**
 * Pick product info from JSON-LD schema.org/Product, if present.
 *
 * Returns null unless the page declares itself a Product with at least a name.
 * Price is optional but strongly preferred — a Product without a price probably
 * isn't a retail product page.
 */
export function pickProduct(raw: RawMetadata | null): ProductInfo | null {
  if (!raw) return null

  const product = findProductNode(raw.jsonLd)
  if (!product) return null

  // Name: Product.name
  let name: string | null = null
  if (typeof product.name === 'string' && product.name.trim()) {
    name = product.name.trim()
  }
  if (!name) return null

  // Image: Product.image (string | string[] | {url})
  let image: string | null = null
  const img = product.image
  if (typeof img === 'string') image = img
  else if (Array.isArray(img) && img.length) {
    const first = img[0]
    if (typeof first === 'string') image = first
    else if (first && typeof first === 'object' && typeof first.url === 'string') image = first.url
  } else if (img && typeof img === 'object' && typeof img.url === 'string') {
    image = img.url
  }
  if (image) image = resolveUrl(image, raw.url)

  // Price: Product.offers.price (offers can be object or array)
  let price: number | null = null
  let currency: string | null = null
  const offers = product.offers
  const firstOffer =
    Array.isArray(offers) && offers.length ? offers[0] :
    offers && typeof offers === 'object' ? offers : null

  if (firstOffer) {
    // price can be number, string, or nested inside priceSpecification
    const rawPrice = firstOffer.price ?? firstOffer.lowPrice ?? firstOffer.priceSpecification?.price
    if (typeof rawPrice === 'number' && !isNaN(rawPrice)) {
      price = rawPrice
    } else if (typeof rawPrice === 'string') {
      const parsed = parseFloat(rawPrice.replace(/[^0-9.]/g, ''))
      if (!isNaN(parsed)) price = parsed
    }
    const rawCurrency =
      firstOffer.priceCurrency ||
      firstOffer.priceSpecification?.priceCurrency ||
      null
    if (typeof rawCurrency === 'string') currency = rawCurrency.toUpperCase()
  }

  // Require a price for the card to render as product.
  // Without price, it's just a product-shaped image — better handled as composite.
  if (price === null) return null

  const priceFormatted = formatPrice(price, currency)

  return { name, image, price, currency, priceFormatted }
}

function formatPrice(price: number, currency: string | null): string {
  const symbolMap: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥', CAD: 'CA$', AUD: 'A$',
  }
  const symbol = currency ? (symbolMap[currency] || currency + ' ') : '$'
  // Drop trailing .00 — "$130" looks cleaner than "$130.00"
  const isWhole = Math.abs(price - Math.round(price)) < 0.01
  const formatted = isWhole ? String(Math.round(price)) : price.toFixed(2)
  return symbol + formatted
}

function findProductNode(jsonLd: any[]): any | null {
  const typeMatches = (t: any): boolean => {
    if (!t) return false
    if (typeof t === 'string') return t === 'Product' || t.endsWith('/Product')
    if (Array.isArray(t)) return t.some(typeMatches)
    return false
  }

  const walk = (node: any): any | null => {
    if (!node || typeof node !== 'object') return null
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item)
        if (found) return found
      }
      return null
    }
    if (typeMatches(node['@type'])) return node
    if (Array.isArray(node['@graph'])) {
      const found = walk(node['@graph'])
      if (found) return found
    }
    return null
  }

  return walk(jsonLd)
}

/**
 * Pick the best description.
 */
export function pickBestDescription(raw: RawMetadata | null): string | null {
  if (!raw) return null
  return (
    raw.og['description'] ||
    raw.twitter['description'] ||
    raw.metaName['description'] ||
    extractJsonLdText(raw.jsonLd, ['description']) ||
    null
  )
}

/**
 * Pick the best site name.
 */
export function pickSiteName(raw: RawMetadata | null): string | null {
  if (!raw) return null
  return raw.og['site_name'] || raw.twitter['site'] || null
}

/**
 * Pick a favicon URL, resolving relative paths. Falls back to Google's favicon service.
 */
export function pickFavicon(raw: RawMetadata | null): string | null {
  if (!raw) return null

  // Prefer larger icons (apple-touch-icon, icon with bigger size)
  const iconHref = raw.icons[0]
  if (iconHref) {
    return resolveUrl(iconHref, raw.url)
  }

  // Google favicon service fallback
  try {
    const domain = new URL(raw.url).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
}

// ── Top-level: full metadata extraction pipeline ────────────────────

/**
 * Fetch + parse a URL into final metadata values, while also returning
 * the raw extraction blob for storage. Storing the raw blob is what lets
 * us re-run the pickers in the future without refetching.
 */
export async function extractMetadata(url: string): Promise<MetadataResult> {
  const html = await fetchHtml(url)
  if (!html) {
    return {
      title: null,
      image: null,
      description: null,
      siteName: null,
      favicon: null,
      product: null,
      raw: null,
    }
  }

  const raw = extractRawMetadata(html, url)
  return {
    title: pickBestTitle(raw),
    image: pickBestImage(raw),
    description: pickBestDescription(raw),
    siteName: pickSiteName(raw),
    favicon: pickFavicon(raw),
    product: pickProduct(raw),
    raw,
  }
}

/**
 * Re-derive final metadata values from a previously-stored raw blob.
 * This is the "free" iteration path: changing picker logic and running
 * this over stored raw_metadata costs zero network calls.
 */
export function deriveFromRaw(raw: RawMetadata | null): MetadataResult {
  return {
    title: pickBestTitle(raw),
    image: pickBestImage(raw),
    description: pickBestDescription(raw),
    siteName: pickSiteName(raw),
    favicon: pickFavicon(raw),
    product: pickProduct(raw),
    raw,
  }
}
