// oEmbed lookup for platforms that block / starve server-side HTML scraping.
//
// Spotify, YouTube, etc. serve a JS app shell to a plain fetch — no real
// og:title/og:image — so our HTML scrape yields "Web Player" + a blank card.
// Their oEmbed endpoints, by contrast, return the real title and a thumbnail
// without auth. We fold the result into RawMetadata.oembed so the pure pickers
// (pickBestTitle/pickBestImage) can prefer it, and deriveFromRaw keeps working
// over stored blobs with no refetch.
//
// Instagram/Facebook oEmbed now requires an app token, so they're intentionally
// absent here — handled separately later.

export interface OEmbedResult {
  title: string | null
  thumbnail: string | null
}

const PROVIDERS: { match: RegExp; endpoint: (url: string) => string }[] = [
  {
    match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/,
    endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)spotify\.com$/,
    endpoint: (u) => `https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)vimeo\.com$/,
    endpoint: (u) => `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)soundcloud\.com$/,
    endpoint: (u) => `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    match: /(^|\.)tiktok\.com$/,
    // TikTok's oEmbed 400s when the url param has no www — normalize the host.
    endpoint: (u) => {
      let target = u
      try {
        const x = new URL(u)
        if (!x.hostname.startsWith('www.')) {
          x.hostname = 'www.' + x.hostname
          target = x.toString()
        }
      } catch {}
      return `https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`
    },
  },
]

/** Returns true if `url`'s host has a registered oEmbed provider above. */
export function hasOEmbed(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return PROVIDERS.some((p) => p.match.test(host))
  } catch {
    return false
  }
}

export async function fetchOEmbed(url: string): Promise<OEmbedResult | null> {
  let host: string
  try {
    host = new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
  const provider = PROVIDERS.find((p) => p.match.test(host))
  if (!provider) return null

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(provider.endpoint(url), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    if (!data) return null
    const title =
      typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null
    const thumbnail =
      typeof data.thumbnail_url === 'string' && data.thumbnail_url.trim()
        ? data.thumbnail_url.trim()
        : null
    if (!title && !thumbnail) return null
    return { title, thumbnail }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
