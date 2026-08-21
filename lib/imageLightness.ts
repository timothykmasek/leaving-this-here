// Is a card image light enough at its EDGES to disappear into a white page?
//
// The perimeter is what matters, not the average: a photo that's dark in the
// middle but white at the border still bleeds into the page, and a dark photo
// with a light centre doesn't. So this samples the outer ring only.
//
// Runs in the browser on an image that has already loaded, so it costs one
// scaled drawImage into a reused 32x32 canvas — no second network fetch for
// same-host images, which the browser has cached from the visible <img>.

const SIZE = 32

// Above this, the edge is light enough that a white page swallows the card's
// boundary. Tuned against real cards: a website screenshot on white sits ~0.97,
// a product shot on pale grey ~0.93, a photo ~0.5 or below.
export const LIGHT_EDGE_THRESHOLD = 0.9

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null

/** Hosts we know send `access-control-allow-origin`, so the canvas won't taint.
 *  Restricted deliberately: setting crossOrigin on an image whose host does NOT
 *  support CORS makes the image fail to load outright, which would break the
 *  card to gain a border. Anything else simply goes unsampled. */
function isSampleable(url: string): boolean {
  try {
    const u = new URL(url, window.location.href)
    if (u.origin === window.location.origin) return true
    return u.hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

/**
 * Mean luminance (0–1) of the image's outer ring, or null when it can't be
 * measured — wrong host, decode failure, tainted canvas. Null means "don't
 * know", and callers should treat that as "no border" rather than guessing.
 */
export async function sampleEdgeLightness(url: string): Promise<number | null> {
  if (typeof document === 'undefined' || !isSampleable(url)) return null
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!ctx) return null
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(img, 0, 0, SIZE, SIZE)
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

    let total = 0
    let n = 0
    const at = (x: number, y: number) => {
      const o = (y * SIZE + x) * 4
      const a = data[o + 3] / 255
      // Transparent pixels sit on the card's own background, which is the page
      // colour — treat them as light rather than as black.
      const lum = a === 0
        ? 1
        : (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
      total += lum
      n++
    }
    for (let x = 0; x < SIZE; x++) { at(x, 0); at(x, SIZE - 1) }
    for (let y = 1; y < SIZE - 1; y++) { at(0, y); at(SIZE - 1, y) }
    return n ? total / n : null
  } catch {
    return null
  }
}
