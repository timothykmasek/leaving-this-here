// PROVISIONAL per-type card format map — the render spec for each card_type,
// derived from the Bulletin DS per-type sheet (Video 16:9, TikTok 9:16, Audio
// 1:1, Book 2:3, …). This is the taxonomy we still need to FINALISE with Tim;
// values here are a first pass so the /preview cards render off real types.
//
// Each entry: the overlay `label`, the mask `aspect` (w/h as a CSS aspect-ratio
// string — the Mask-group knob that gives each type its shape), and an optional
// `affordance` hint the card can decorate with (play glyph, price pill, etc.).
import type { CardType } from '@/lib/cardType'

export type Affordance = 'play' | 'price' | 'favicon' | 'disc' | 'spine' | 'avatar' | null

// How the image sits in the mask:
//   cover   — fills the frame, cropping overflow (photos, screenshots, heroes)
//   contain — whole image padded on a white plate, nothing cropped (catalog
//             product shots, book covers — a wide logo won't get chopped)
export type Fit = 'cover' | 'contain'

export interface CardFormat {
  label: string
  aspect: string      // e.g. '16 / 9', '295 / 439'
  fit: Fit
  affordance: Affordance
}

// The DS "Primary Card" default is the tall 295 × 439.198 portrait.
const TALL = '295 / 439'

const FORMATS: Record<string, CardFormat> = {
  // ✅ READY — have backing data today
  article:    { label: 'Article', aspect: '3 / 2',   fit: 'cover',   affordance: 'favicon' }, // image-on-top, landscape
  product:    { label: 'Product', aspect: TALL,      fit: 'contain', affordance: 'price' },   // padded catalog shot
  fullbleed:  { label: 'Product', aspect: '2 / 3',   fit: 'contain', affordance: 'price' },   // shop product photo / logo
  composite:  { label: 'Post',    aspect: '1.91 / 1', fit: 'cover',  affordance: 'favicon' }, // social og card
  screenshot: { label: 'Site',    aspect: '4 / 3',   fit: 'cover',   affordance: 'favicon' }, // homepage / landing — the 82% bucket
  book:       { label: 'Book',    aspect: '2 / 3',   fit: 'contain', affordance: 'spine' },
  profile:    { label: 'Profile', aspect: '1 / 1',   fit: 'cover',   affordance: 'avatar' },
  lth:        { label: 'Link',    aspect: TALL,      fit: 'cover',   affordance: 'favicon' },
  // ⚠️ NOT YET CLASSIFIED — templates ready, but classifyCardType emits none of
  // these yet (0 rows today). Kept here so the map is complete.
  video:      { label: 'Video',   aspect: '16 / 9',  fit: 'cover',   affordance: 'play' },
  audio:      { label: 'Audio',   aspect: '1 / 1',   fit: 'cover',   affordance: 'disc' },
  tiktok:     { label: 'TikTok',  aspect: '9 / 16',  fit: 'cover',   affordance: 'play' },
  tweet:      { label: 'Tweet',   aspect: TALL,      fit: 'cover',   affordance: 'avatar' },
}

const FALLBACK: CardFormat = { label: 'Link', aspect: TALL, fit: 'cover', affordance: 'favicon' }

export function cardFormat(cardType?: CardType | string | null): CardFormat {
  return (cardType && FORMATS[cardType]) || FALLBACK
}
