// Place links (Google/Apple Maps) → structured place data, with NO Google API
// key and no Google fetch.
//
// Why this exists: Maps place URLs are bot-gated for datacenter fetches (they
// redirect to /sorry/index), so the normal metadata chain degrades to Google's
// site-level boilerplate — every Maps bullet lands as title "Google Maps",
// description "Find local businesses…", and keywords about Maps-the-product.
// The actual place name is sitting right there in the URL path, so we read it
// from there and resolve the rest with OpenStreetMap's free geocoder.
//
// Nothing here touches the save path yet — it feeds /preview/place while the
// card treatment is being chosen.

export interface ParsedPlaceUrl {
  /** Place name lifted from the URL path, e.g. "Cherry Paris". */
  name: string | null
  /** Coordinates when the URL carries them (@lat,lng,zoom or ?q=lat,lng). */
  lat: number | null
  lon: number | null
  /** Zoom from an @lat,lng,17z segment, when present. */
  zoom: number | null
}

/** What a place bullet stores under bookmarks.raw_metadata.place. Written by
 *  scripts/enrich-places.js; read by PrimaryCard to render the Place card. */
export interface PlaceMeta {
  name: string | null
  kind: string | null
  price: string | null
  rating: string | null
  reviews: string | null
  address: string | null
  city: string | null
  lat: number | null
  lon: number | null
  /** Storage URL of a hero photo cut as its own file. Only the backfill script
   *  produces one (it has ImageMagick); the save path stores a box instead. */
  photo: string | null
  /** The hero photo as a fractional box within the capture, clipped in CSS.
   *  Lets save-time enrichment run on Vercel with no image processing. */
  photoBox: {
    x: number
    y: number
    w: number
    h: number
    /** capture width / capture height */
    sourceAspect: number
  } | null
  source: string
}

export interface ResolvedPlace {
  name: string
  lat: number
  lon: number
  /** OSM class/type, e.g. "restaurant", "cafe", "museum". */
  kind: string | null
  /** Short human line: "Rue Bernard Palissy, Paris 6e". */
  addressLine: string | null
  /** "Paris", "Singapore" — the city/town/village. */
  city: string | null
  country: string | null
  /** Full display name from the geocoder, for debugging / tooltips. */
  displayName: string | null
}

/** True for URLs that point at a map place rather than a web page. */
export function isPlaceUrl(urlStr: string): boolean {
  try {
    const u = new URL(urlStr)
    const h = u.hostname.replace(/^www\./, '')
    if (h === 'maps.app.goo.gl' || h === 'goo.gl' && u.pathname.startsWith('/maps')) return true
    if (h === 'maps.google.com') return true
    if (h.startsWith('google.') || h.includes('.google.')) return u.pathname.startsWith('/maps')
    if (h === 'maps.apple.com') return true
    if (h === 'openstreetmap.org') return true
    return false
  } catch {
    return false
  }
}

/**
 * Pull whatever the URL itself carries. Handles the common Google Maps shapes:
 *   /maps/place/Cherry+Paris/data=…            → name
 *   /maps/place/Cherry+Paris/@48.85,2.33,17z/… → name + coords + zoom
 *   /maps/@48.85,2.33,17z                      → coords
 *   /maps?q=48.85,2.33                         → coords
 *   maps.apple.com/?q=Cherry&ll=48.85,2.33     → name + coords
 */
export function parsePlaceUrl(urlStr: string): ParsedPlaceUrl {
  const out: ParsedPlaceUrl = { name: null, lat: null, lon: null, zoom: null }
  let u: URL
  try { u = new URL(urlStr) } catch { return out }

  // ── Name: the path segment after /place/ ──────────────────────────────────
  const placeMatch = u.pathname.match(/\/place\/([^/@]+)/)
  if (placeMatch) {
    const raw = decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ').trim()
    // Google sometimes appends the full address to the slug; keep the leading
    // name-ish part and let the geocoder disambiguate the rest.
    if (raw && !/^\d+$/.test(raw)) out.name = raw
  }
  // Apple Maps + Google ?q= name form
  const q = u.searchParams.get('q')
  if (!out.name && q && !/^-?\d+\.?\d*,-?\d+\.?\d*$/.test(q)) {
    out.name = decodeURIComponent(q).replace(/\+/g, ' ').trim()
  }

  // ── Coordinates: @lat,lng,17z in the path ─────────────────────────────────
  const at = u.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)(?:,(\d+(?:\.\d+)?)z)?/)
  if (at) {
    out.lat = parseFloat(at[1])
    out.lon = parseFloat(at[2])
    if (at[3]) out.zoom = parseFloat(at[3])
  }
  // ?q=lat,lng or ?ll=lat,lng (Apple)
  const coordParam = q && /^-?\d+\.?\d*,-?\d+\.?\d*$/.test(q) ? q : u.searchParams.get('ll')
  if (out.lat == null && coordParam) {
    const [a, b] = coordParam.split(',').map(parseFloat)
    if (Number.isFinite(a) && Number.isFinite(b)) { out.lat = a; out.lon = b }
  }
  return out
}

/** Tidy the geocoder's address bag into one short editorial line. */
function shortAddress(a: Record<string, string> | undefined): string | null {
  if (!a) return null
  const street = a.road || a.pedestrian || a.footway || null
  const area =
    a.suburb || a.neighbourhood || a.city_district || a.quarter || null
  const parts = [street, area].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

// OSM top-level classes that describe somewhere you'd actually save: a venue, a
// shop, a landmark, a park, a city. Everything outside this list is
// infrastructure — and the failure it prevents is the loud one: searching a
// generic name like "Joe" returns `class=highway type=trunk` (11th Avenue), and
// without this filter the card renders a confident, wrong place for a road.
const PLACE_CLASSES = new Set([
  'amenity', 'shop', 'tourism', 'leisure', 'historic', 'craft',
  'office', 'building', 'club', 'healthcare', 'natural', 'landuse', 'place',
])

/** Metres between two lat/lon pairs (equirectangular — plenty at city scale). */
function metresBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371000
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const mLat = ((aLat + bLat) / 2) * (Math.PI / 180)
  const x = dLon * Math.cos(mLat)
  return Math.sqrt(dLat * dLat + x * x) * R
}

/**
 * Resolve a place through OpenStreetMap's Nominatim. Free, no key, but rate
 * limited to ~1 req/sec and it wants a real User-Agent — so this is meant to
 * run ONCE per bullet at save time, never per page view.
 *
 * Returns null rather than a guess when nothing in the result set is actually a
 * place. A wrong-but-confident place card is worse than the generic one it
 * replaces, so "no match" has to stay a real outcome.
 */
export async function geocodePlace(
  name: string,
  hint?: { lat?: number | null; lon?: number | null },
): Promise<ResolvedPlace | null> {
  const hasHint = hint?.lat != null && hint?.lon != null
  const params = new URLSearchParams({
    q: name, format: 'json', limit: '5', addressdetails: '1',
  })
  // A tight box around the URL's own coordinates. ~1.3km, NOT the ~17km box
  // that let "Le Baratin" resolve to a different Le Baratin across Paris.
  // Rank-1 is not trustworthy on its own here, so we over-fetch and choose.
  if (hasHint) {
    const d = 0.012
    params.set('viewbox', `${hint!.lon! - d},${hint!.lat! + d},${hint!.lon! + d},${hint!.lat! - d}`)
    params.set('bounded', '1')
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { 'User-Agent': 'Bulletin/0.1 (yourbulletin.com)' },
    next: { revalidate: 60 * 60 * 24 * 30 },
  })
  if (!res.ok) return null
  const rows: any[] = await res.json()
  if (!Array.isArray(rows) || rows.length === 0) return null

  // Keep only real places, then prefer the one nearest the URL's coordinates.
  const candidates = rows.filter((r) => PLACE_CLASSES.has(r.class))
  if (candidates.length === 0) return null
  const r = hasHint
    ? candidates.slice().sort((a, b) =>
        metresBetween(hint!.lat!, hint!.lon!, parseFloat(a.lat), parseFloat(a.lon)) -
        metresBetween(hint!.lat!, hint!.lon!, parseFloat(b.lat), parseFloat(b.lon)))[0]
    : candidates[0]

  const a = r.address || {}
  return {
    name: (r.name && r.name.trim()) || name,
    lat: parseFloat(r.lat),
    lon: parseFloat(r.lon),
    kind: r.type || r.class || null,
    addressLine: shortAddress(a),
    city: a.city || a.town || a.village || a.municipality || null,
    country: a.country || null,
    displayName: r.display_name || null,
  }
}
