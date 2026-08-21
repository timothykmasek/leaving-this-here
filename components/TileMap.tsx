'use client'

// A static slippy-map plate stitched from raster tiles — no map library, no
// API key, no JS interaction. Renders the tiles that cover a WxH box centred on
// (lat, lon) at a given zoom, absolutely positioned with sub-tile offsets.
//
// This is deliberately a dumb <img> grid: for production the intent is to BAKE
// the composed map to Supabase storage once at save time (same as screenshots)
// and serve that flat file, rather than pulling tiles on every page view.

const TILE = 256

export type MapStyle = 'positron' | 'voyager' | 'dark' | 'osm' | 'satellite'

const TILE_URL: Record<MapStyle, (z: number, x: number, y: number) => string> = {
  positron:  (z, x, y) => `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}@2x.png`,
  voyager:   (z, x, y) => `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`,
  dark:      (z, x, y) => `https://basemaps.cartocdn.com/dark_all/${z}/${x}/${y}@2x.png`,
  osm:       (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
  satellite: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
}

/** Fractional tile coordinates (Web Mercator) for a lat/lon at zoom z. */
function project(lat: number, lon: number, z: number) {
  const n = 2 ** z
  const x = ((lon + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n
  return { x, y }
}

interface TileMapProps {
  lat: number
  lon: number
  zoom?: number
  width: number
  height: number
  style?: MapStyle
  /** Optional CSS filter applied to the tile layer only (not the pin). */
  filter?: string
  className?: string
  children?: React.ReactNode
}

export function TileMap({
  lat, lon, zoom = 16, width, height, style = 'positron', filter, className, children,
}: TileMapProps) {
  const { x: xf, y: yf } = project(lat, lon, zoom)
  const n = 2 ** zoom

  // Which tiles touch the viewport box, given the centre sits at (W/2, H/2).
  const x0 = Math.floor(xf - width / 2 / TILE)
  const x1 = Math.floor(xf + width / 2 / TILE)
  const y0 = Math.floor(yf - height / 2 / TILE)
  const y1 = Math.floor(yf + height / 2 / TILE)

  const tiles: { key: string; src: string; left: number; top: number }[] = []
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      if (y < 0 || y >= n) continue
      const wrappedX = ((x % n) + n) % n // wrap across the antimeridian
      tiles.push({
        key: `${x}:${y}`,
        src: TILE_URL[style](zoom, wrappedX, y),
        left: Math.round((x - xf) * TILE + width / 2),
        top: Math.round((y - yf) * TILE + height / 2),
      })
    }
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ''}`} style={{ width, height }}>
      <div className="absolute inset-0" style={{ filter }}>
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.src}
            alt=""
            aria-hidden
            width={TILE}
            height={TILE}
            className="absolute max-w-none select-none"
            style={{ left: t.left, top: t.top, width: TILE, height: TILE }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
          />
        ))}
      </div>
      {children}
    </div>
  )
}

/** The place marker — centred on the plate, since the plate is centred on the place. */
export function MapPin({ tone = 'ink' }: { tone?: 'ink' | 'white' }) {
  const fill = tone === 'white' ? '#ffffff' : '#2b2b2b'
  const ring = tone === 'white' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.9)'
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full"
    >
      <svg width="26" height="34" viewBox="0 0 26 34" fill="none">
        <path
          d="M13 1.5c-5.8 0-10.5 4.6-10.5 10.3 0 7.6 9.1 19 10.1 20.2a.5.5 0 0 0 .8 0c1-1.2 10.1-12.6 10.1-20.2C23.5 6.1 18.8 1.5 13 1.5Z"
          fill={fill}
          stroke={ring}
          strokeWidth="2.5"
        />
        <circle cx="13" cy="11.8" r="3.6" fill={ring} />
      </svg>
    </span>
  )
}
