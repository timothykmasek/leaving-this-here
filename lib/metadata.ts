// Shared metadata extraction — used by both fetch-metadata API and backfill

export interface MetadataResult {
  title: string | null
  image: string | null
  description: string | null
  siteName: string | null
  favicon: string | null
}

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

/**
 * Extract an OG meta tag value from HTML.
 * Handles both attribute orders:
 *   <meta property="og:title" content="…">
 *   <meta content="…" property="og:title">
 * Also handles name= instead of property= and single quotes.
 */
function extractOGTag(html: string, tag: string): string | null {
  // Pattern 1: property/name first, then content
  const p1 = new RegExp(
    `<meta\\s+(?:property|name)=["']og:${tag}["']\\s+content=["']([^"']+)["']`,
    'i',
  )
  const m1 = html.match(p1)
  if (m1?.[1]) return decodeHtmlEntities(m1[1])

  // Pattern 2: content first, then property/name
  const p2 = new RegExp(
    `<meta\\s+content=["']([^"']+)["']\\s+(?:property|name)=["']og:${tag}["']`,
    'i',
  )
  const m2 = html.match(p2)
  if (m2?.[1]) return decodeHtmlEntities(m2[1])

  return null
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

function extractTitle(html: string): string | null {
  const ogTitle = extractOGTag(html, 'title')
  if (ogTitle) return ogTitle

  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1]?.trim() || null
}

function extractFavicon(html: string, baseUrl: string): string | null {
  // Try rel="icon" or rel="shortcut icon"
  const iconMatch = html.match(
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["'][^>]*>/i,
  )
  // Also check reversed order (href before rel)
  const iconMatch2 = html.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["'][^>]*>/i,
  )

  const href = iconMatch?.[1] || iconMatch2?.[1]
  if (href) {
    if (href.startsWith('http')) return href
    if (href.startsWith('//')) return 'https:' + href
    try {
      const base = new URL(baseUrl)
      return href.startsWith('/')
        ? `${base.protocol}//${base.hostname}${href}`
        : `${base.protocol}//${base.hostname}/${href}`
    } catch {
      // fall through
    }
  }

  // Fallback to Google Favicon service
  try {
    const domain = new URL(baseUrl).hostname
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
  } catch {
    return null
  }
}

/**
 * Given a URL, fetch its HTML and extract OG metadata.
 * This runs server-side (API route or backfill) — no third-party API needed.
 */
export async function extractMetadata(url: string): Promise<MetadataResult> {
  const html = await fetchHtml(url)
  if (!html) {
    return { title: null, image: null, description: null, siteName: null, favicon: null }
  }

  return {
    title: extractTitle(html),
    image: extractOGTag(html, 'image'),
    description: extractOGTag(html, 'description'),
    siteName: extractOGTag(html, 'site_name'),
    favicon: extractFavicon(html, url),
  }
}
