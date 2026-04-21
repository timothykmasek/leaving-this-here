// Rich-embed detection for known platforms. Pure URL parsing — no network
// calls — so this is safe to run on every render. If a URL matches, we can
// render an inline player (click-to-play for YouTube/Vimeo, always-live for
// Spotify) instead of a static bookmark card.

export type EmbedKind = 'youtube' | 'spotify' | 'vimeo' | null

export interface EmbedInfo {
  kind: EmbedKind
  id: string
  // Spotify uses different /embed/{type}/{id} paths for track/episode/etc.
  spotifyType?: 'track' | 'episode' | 'album' | 'playlist' | 'show' | 'artist'
  embedUrl: string
  // Fallback thumbnail for click-to-play cards. Spotify embeds are always
  // live so this is mainly for YouTube/Vimeo.
  thumbnail?: string
}

export function detectEmbed(url: string): EmbedInfo | null {
  if (!url) return null

  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }

  const host = u.hostname.replace(/^www\./, '').toLowerCase()

  // YouTube — watch, shorts, embed, youtu.be
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com') {
    let id: string | null = null
    if (host === 'youtu.be') {
      id = u.pathname.slice(1).split('/')[0] || null
    } else if (u.pathname.startsWith('/watch')) {
      id = u.searchParams.get('v')
    } else if (u.pathname.startsWith('/shorts/')) {
      id = u.pathname.split('/')[2] || null
    } else if (u.pathname.startsWith('/embed/')) {
      id = u.pathname.split('/')[2] || null
    }
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return {
        kind: 'youtube',
        id,
        embedUrl: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`,
        thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      }
    }
  }

  // Spotify — track / episode / album / playlist / show / artist
  if (host === 'open.spotify.com' || host === 'spotify.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    const type = parts[0] as EmbedInfo['spotifyType']
    const id = parts[1]
    if (id && type && ['track', 'episode', 'album', 'playlist', 'show', 'artist'].includes(type)) {
      return {
        kind: 'spotify',
        id,
        spotifyType: type,
        embedUrl: `https://open.spotify.com/embed/${type}/${id}`,
      }
    }
  }

  // Vimeo — straightforward /{id} or /{channel}/{id} paths
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean)
    const id = parts[parts.length - 1]
    if (id && /^\d+$/.test(id)) {
      return {
        kind: 'vimeo',
        id,
        embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1`,
      }
    }
  }

  return null
}
