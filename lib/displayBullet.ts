import { formatCardTitle } from '@/lib/cardTitle'
import { pickCardImage } from '@/lib/cardImage'

// Display mapping for bullets served to native clients (the iOS app via
// /api/extension/*). Native renders what the API returns verbatim, so the
// web's render-time brains run here — formatCardTitle (the `Brand — what it
// is` voice) and pickCardImage (og vs screenshot vs custom). One
// implementation, every client; never port these to Swift.

// The select both routes share, so the mapper's inputs can't drift apart.
export const DISPLAY_BULLET_COLS =
  'id, url, title, description, image_url, screenshot_url, favicon_url, card_type, image_pref, created_at, site_name:raw_metadata->og->>site_name, custom_image:raw_metadata->>customImage'

export function mapDisplayBullet(b: any) {
  return {
    id: b.id,
    url: b.url,
    title: b.title,
    image_url: b.image_url,
    favicon_url: b.favicon_url,
    created_at: b.created_at,
    display_title: formatCardTitle({
      title: b.title,
      description: b.description,
      url: b.url,
      siteName: b.site_name ?? null,
    }),
    display_image: pickCardImage(
      b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref, b.custom_image,
    ),
    ...(b.list_bookmarks
      ? {
          lists: (b.list_bookmarks || [])
            .map((m: any) => m.lists)
            .filter(Boolean)
            .map((l: any) => ({ name: l.name, slug: l.slug })),
        }
      : {}),
  }
}
