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

/** Worth attempting at all. Any http(s) URL is: the sample loads its OWN Image
 *  object, so a host without CORS taints that one and yields null — it cannot
 *  affect the visible <img>, which is a separate element loaded without
 *  crossOrigin. (This was originally limited to our own bucket out of a
 *  misplaced worry about breaking the card; it only cost borders. Webflow,
 *  Shopify, ytimg and friends all send access-control-allow-origin: *.) */
function isSampleable(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Defer to idle so sampling never competes for bandwidth with the images the
 *  reader is actually looking at. For a cross-origin host the CORS-mode request
 *  may not reuse the visible image's cache entry, so this can be a second
 *  fetch — worth having happen late rather than never. */
function onIdle(fn: () => void): () => void {
  const ric = (window as any).requestIdleCallback
  if (typeof ric === 'function') {
    const id = ric(fn, { timeout: 2000 })
    return () => (window as any).cancelIdleCallback?.(id)
  }
  const id = window.setTimeout(fn, 300)
  return () => window.clearTimeout(id)
}
export { onIdle }

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

// ── Small images ────────────────────────────────────────────────────────────

/** Narrower than this and the card should not stretch it. Cards render around
 *  295-430px wide, so a 150px avatar blown up to fill one is visibly soft while
 *  a 400px og:image is fine. Instagram profile pictures — the case this exists
 *  for — arrive at exactly 150. */
export const SMALL_IMAGE_WIDTH = 320

export type ImageField = {
  width: number
  height: number
  /** A colour taken from the image's own corners, for the plate it sits on.
   *  null when the canvas was tainted or the decode failed. */
  background: string | null
}

/**
 * Natural size, plus a background colour drawn from the image's corners.
 *
 * For a small image the answer to "how do we fill a card with this?" is not to
 * scale it up — mymind's Instagram cards keep the avatar at its own size and
 * flood the rest of the card with a colour from the picture, so the card reads
 * as a subject placed on a field rather than a stretched thumbnail.
 *
 * The corners rather than the average: a centred subject on a plain ground —
 * which is what an avatar or a logo is — has its ground at the edges. Averaging
 * the whole image would drag the colour toward the subject and lose the field.
 */
export async function sampleImageField(url: string): Promise<ImageField | null> {
  if (typeof document === 'undefined' || !isSampleable(url)) return null
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.crossOrigin = 'anonymous'
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = url
    })
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (!width || !height) return null

    if (!canvas) {
      canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      ctx = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!ctx) return { width, height, background: null }
    ctx.clearRect(0, 0, SIZE, SIZE)
    ctx.drawImage(img, 0, 0, SIZE, SIZE)
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE)

    // One pixel in from each corner, so a stray border row can't decide it.
    const at = (x: number, y: number) => {
      const i = (y * SIZE + x) * 4
      return [data[i], data[i + 1], data[i + 2]]
    }
    const corners = [at(1, 1), at(SIZE - 2, 1), at(1, SIZE - 2), at(SIZE - 2, SIZE - 2)]
    const avg = [0, 1, 2].map((c) => Math.round(corners.reduce((a, p) => a + p[c], 0) / corners.length))
    return { width, height, background: `rgb(${avg[0]}, ${avg[1]}, ${avg[2]})` }
  } catch {
    return null
  }
}
