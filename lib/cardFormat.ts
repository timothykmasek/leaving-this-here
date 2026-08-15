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

export interface CardFormat {
  label: string
  // Fallback plate shape for an IMAGELESS card (favicon plate). Cards WITH an
  // image render at the image's natural aspect — no crop, no letterbox (Tim,
  // 2026-08-15: no forced crop, no white padding). So this only shapes the
  // no-image case.
  aspect: string      // e.g. '16 / 9', '295 / 439'
  affordance: Affordance
}

// The DS "Primary Card" default is the tall 295 × 439.198 portrait.
const TALL = '295 / 439'

const FORMATS: Record<string, CardFormat> = {
  // ✅ READY — have backing data today
  article:    { label: 'Article', aspect: '3 / 2',   affordance: 'favicon' },
  product:    { label: 'Product', aspect: TALL,      affordance: 'price' },
  fullbleed:  { label: 'Product', aspect: '2 / 3',   affordance: 'price' },
  composite:  { label: 'Post',    aspect: '1.91 / 1', affordance: 'favicon' },
  screenshot: { label: 'Site',    aspect: '4 / 3',   affordance: 'favicon' }, // homepage / landing — the 82% bucket
  book:       { label: 'Book',    aspect: '2 / 3',   affordance: 'spine' },
  profile:    { label: 'Profile', aspect: '1 / 1',   affordance: 'avatar' },
  lth:        { label: 'Link',    aspect: TALL,      affordance: 'favicon' },
  // ⚠️ NOT YET CLASSIFIED — templates ready, but classifyCardType emits none of
  // these yet (0 rows today). Kept here so the map is complete.
  video:      { label: 'Video',   aspect: '16 / 9',  affordance: 'play' },
  audio:      { label: 'Audio',   aspect: '1 / 1',   affordance: 'disc' },
  tiktok:     { label: 'TikTok',  aspect: '9 / 16',  affordance: 'play' },
  tweet:      { label: 'Tweet',   aspect: TALL,      affordance: 'avatar' },
}

const FALLBACK: CardFormat = { label: 'Link', aspect: TALL, affordance: 'favicon' }

export function cardFormat(cardType?: CardType | string | null): CardFormat {
  return (cardType && FORMATS[cardType]) || FALLBACK
}
