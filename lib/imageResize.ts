// Downscale + re-encode an image in the browser before upload.
//
// Bulletin serves images DIRECT from Supabase with no optimizer in front (the
// Vercel one is off — it burned through its quota), so whatever gets uploaded
// is exactly what every visitor downloads. A 6MB photo straight off a phone
// would be a 6MB cover on every page view. There's no `sharp` in the project
// and no wish to add server-side image processing for one field, so the resize
// happens where the file already is: the user's own browser.
//
// webp because the cover is photographic and it's what the screenshot pipeline
// already standardises on.

// The cover renders at most 1184px wide; 1600 leaves headroom for wide viewports
// and denser displays without pushing the file into megabytes.
const MAX_COVER_WIDTH = 1600
const COVER_QUALITY = 0.82

export type ResizedImage = { blob: Blob; width: number; height: number }

/**
 * Read `file`, downscale it to at most `maxWidth`, and re-encode as webp.
 * Images already narrower than `maxWidth` are re-encoded but not upscaled.
 * Rejects if the file isn't a decodable image.
 */
export async function resizeImageToWebp(
  file: File,
  maxWidth: number = MAX_COVER_WIDTH,
  quality: number = COVER_QUALITY,
): Promise<ResizedImage> {
  const bitmap = await loadBitmap(file)
  try {
    const scale = Math.min(1, maxWidth / bitmap.width)
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('could not get a 2d context')
    ctx.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', quality)
    )
    if (!blob) throw new Error('could not encode the image')
    return { blob, width, height }
  } finally {
    // createImageBitmap allocates off-heap; the <img> fallback has nothing to
    // free but exposes a no-op close() shim so callers don't have to branch.
    bitmap.close()
  }
}

type ClosableBitmap = CanvasImageSource & { width: number; height: number; close: () => void }

async function loadBitmap(file: File): Promise<ClosableBitmap> {
  if (typeof createImageBitmap === 'function') {
    try {
      return (await createImageBitmap(file)) as unknown as ClosableBitmap
    } catch {
      // Safari has historically refused some types here; fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('could not read that image'))
      el.src = url
    })
    return Object.assign(img, {
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    }) as unknown as ClosableBitmap
  } catch (err) {
    URL.revokeObjectURL(url)
    throw err
  }
}
