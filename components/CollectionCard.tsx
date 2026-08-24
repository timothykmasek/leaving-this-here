// Bulletin "collection card" — a list rendered as a plate in the profile's
// LISTS tab. Figma ProjectX list-card frame: a 295×393 #F1F1F1 plate carrying a
// single filmstrip of member thumbnails that bleeds off BOTH edges and dissolves
// into the plate, with the name + count anchored bottom-left.
//
// The filmstrip is the whole idea, and it replaces the old contained 2×2
// collage. Each thumb keeps its own aspect ratio at one shared height, so the
// strip has the ragged rhythm of a contact sheet rather than the tidy beat of a
// grid — that's why the Figma export's images are 156/156/72 wide rather than
// three equal tiles. Widths therefore come from the images themselves
// (`h-full w-auto`), not from us.

import Link from 'next/link'
import { LinkStrip } from '@/components/LinkStrip'

// Geometry as percentages of the 295×393 plate, so the card scales with its
// grid column instead of pinning to the Figma artboard's pixels.
const STRIP_TOP = '34.9%'    // 137/393
const STRIP_H = '27.7%'      // 109/393
const FADE_W = '15.25%'      // 45/295
// Tile width cap, and the knob that sets how many tiles you actually SEE:
// visible ≈ 100/THUMB_MAX_W, because Bulletin's card images are overwhelmingly
// landscape screenshots and therefore nearly all clamp to it. The Figma frame's
// 53% (156/295) reads as three only because its strip happens to include one
// portrait tile; with real data 53% showed two. 35% is the deliberate choice
// for a three-across contact sheet — 2 full tiles plus a cropped one at each
// edge. It also still caps a panoramic screenshot from eating the strip.
const THUMB_MAX_W = '35%'

export function CollectionCard({
  name,
  count,
  thumbs,
  isPrivate,
  onClick,
  href,
}: {
  name: string
  count: number
  thumbs: string[]
  isPrivate?: boolean
  onClick?: () => void
  // When set, the card is a real link to the list's public URL (visitors go
  // straight to /username/<slug>). Otherwise it's a button (owner in-page view).
  href?: string
}) {
  const className =
    'relative block aspect-[295/393] w-full overflow-hidden rounded-[20px] bg-card text-left ring-1 ring-black/[0.03] card-lift'

  const inner = (
    <>
      {/* Registration mark — three 2px dots, 8px pitch, top-left inset 20px.
          Decorative (the brand's dot-corner motif, same family as the header's
          mark), NOT a kebab menu: the Figma layer is a group of Ellipses with no
          hit target, and a real menu would sit top-right. */}
      <span
        aria-hidden
        className="absolute left-5 top-5 flex flex-col gap-[6px]"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-[2px] w-[2px] bg-[#1FA9D3]" />
        ))}
      </span>

      {/* The card's identity: a contact-sheet band of its members, bleeding off
          both edges into the plate. Shared with the list page's default cover
          (components/LinkStrip) — the same asset at two scales. */}
      <LinkStrip
        thumbs={thumbs}
        className="absolute inset-x-0"
        style={{ top: STRIP_TOP, height: STRIP_H }}
        thumbMaxWidth={THUMB_MAX_W}
        fadeWidth={FADE_W}
      />

      {/* Name + count, anchored to the bottom-left 20px inset. Anchoring the
          BLOCK (rather than positioning each line at its Figma offset) keeps the
          count on its 20px baseline and lets a two-line name grow upward. */}
      <div className="absolute inset-x-5 bottom-5">
        {/* Cardo Bold 16/20, -0.02em. Cardo registers its own 700, so unlike
            Mier A the exported weight is safe to copy here. `capitalize`
            title-cases the display (names are often typed lowercase, e.g. "ai")
            while leaving the stored name — source of the frozen slug — alone. */}
        <h3 className="line-clamp-2 font-serif text-[16px] font-bold capitalize leading-5 tracking-[-0.02em] text-black/70">
          {name}
        </h3>
        {/* Mier A BOOK — the export reads `font-weight: 500`, which is Book in
            this family's inverted metadata, so 400 is the faithful value; 500
            would silently load Regular. Fill 0.7 × layer opacity 0.8 = 0.56,
            the same alpha the bullet card's title settled on. */}
        <p className="mt-2 font-sans text-[12px] font-[400] leading-4 tracking-[0.05em] text-black/[0.56]">
          {count} {count === 1 ? 'Item' : 'Items'}{isPrivate ? ' · Private' : ''}
        </p>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  )
}
