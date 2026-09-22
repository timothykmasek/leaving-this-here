// Bulletin "collection card" — a list rendered as a plate in the profile's
// LISTS tab. Figma ProjectX list-card frame, cut to 3/4 its height from `sm`
// up: a 295×295 #F1F1F1 plate (the artboard was 295×393; the extra air read as
// dead on a desktop grid). Phones keep the artboard's 3:4 — two-up at ~165px
// wide, a square has no room for the band AND a two-line name. Carrying a
// single filmstrip of member thumbnails that bleeds off BOTH edges and dissolves
// into the plate, with the name + count anchored bottom-left.
//
// The filmstrip is the whole idea, and it replaces the old contained 2×2
// collage. Each thumb keeps its own aspect ratio at one shared height, so the
// strip has the ragged rhythm of a contact sheet rather than the tidy beat of a
// grid — that's why the Figma export's images are 156/156/72 wide rather than
// three equal tiles. Widths therefore come from the images themselves
// (`h-full w-auto`), not from us.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LinkStrip } from '@/components/LinkStrip'

// Geometry. The band keeps the artboard's proportion — 109 tall on a
// 295-wide plate — so it scales with the grid column. It is NOT placed by a
// percentage of the plate's height any more: it sits centred in the well THE
// EYE MEASURES, between the registration dots' foot and the top of the name
// block, and that well is laid out with flex so the card does the centring
// itself. The name block always reserves two lines, so every card in a row
// puts its band at the same height whether its name wraps or not.
//
// The reason for the flex: on a phone the grid is two-up, the plate is
// ~200px wide, and a two-line name plus count needs 84px of the 200 — the
// old fixed 22.4%/36.95% band ran straight through the first line of
// "Talent Marketplaces + AI". Now the band takes the room that is actually
// left (max-height 100% of the well) and shrinks before it can collide.
const STRIP_ASPECT = '295 / 109'
// Dots' foot: 20px inset + three 2px dots on an 8px pitch.
const WELL_TOP = 'pt-[38px]'
// Two lines of Cardo 16/20 + 8px + the 12/16 count.
const NAME_MIN_H = 'min-h-[64px]'
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
  onClick,
  href,
}: {
  name: string
  count: number
  thumbs: string[]
  onClick?: () => void
  // When set, the card is a real link to the list's public URL (visitors go
  // straight to /username/<slug>). Otherwise it's a button (owner in-page view).
  href?: string
}) {
  const className =
    'relative block aspect-[3/4] w-full overflow-hidden rounded-[20px] bg-card text-left ring-1 ring-black/[0.03] card-lift sm:aspect-square'

  // false until hovered → no viewport prefetch; true → full payload.
  const [warm, setWarm] = useState(false)

  const inner = (
    <>
      {/* Registration mark — three 2px dots, 8px pitch, top-left inset 20px.
          Decorative (the brand's dot-corner motif, same family as the header's
          mark), NOT a kebab menu: the Figma layer is a group of Ellipses with no
          hit target, and a real menu would sit top-right.

          Grey, not the cyan the export carried: a decorative mark that reads as
          the only colour on an otherwise monochrome plate looks like a status
          light, and invites a click it does not answer. 0.35 sits below the
          count's 0.56 on the card's own alpha ladder, so it recedes behind the
          two things that are actually information. */}
      <span
        aria-hidden
        className="absolute left-5 top-5 flex flex-col gap-[6px]"
      >
        {[0, 1, 2].map((i) => (
          <span key={i} className="block h-[2px] w-[2px] bg-black/[0.35]" />
        ))}
      </span>

      <div className={`absolute inset-0 flex flex-col ${WELL_TOP} pb-5`}>
        {/* The well: whatever height is left between the dots and the name
            block, with the band centred in it. */}
        <div className="flex min-h-0 flex-1 items-center">
          {thumbs.length > 0 ? (
            // The card's identity: a contact-sheet band of its members,
            // bleeding off both edges into the plate. Shared with the list
            // page's default cover (components/LinkStrip) — the same asset at
            // two scales. Width-proportioned, capped by the well.
            <div className="max-h-full w-full" style={{ aspectRatio: STRIP_ASPECT }}>
              <LinkStrip
                thumbs={thumbs}
                className="relative h-full w-full"
                thumbMaxWidth={THUMB_MAX_W}
                fadeWidth={FADE_W}
                drift
              />
            </div>
          ) : (
            // Nothing in it yet: the Create New List pill's idea as a card —
            // the + (45/295 wide, same 2px stroke) on the band's own midline,
            // so an empty list still reads as a list among its siblings.
            <svg
              aria-hidden
              viewBox="0 0 45 45"
              fill="none"
              className="mx-auto w-[15.25%]"
            >
              <line x1="22.5" y1="0" x2="22.5" y2="45" stroke="#B8B8B8" strokeWidth="2" />
              <line x1="0" y1="22.5" x2="45" y2="22.5" stroke="#B8B8B8" strokeWidth="2" />
            </svg>
          )}
        </div>

        {/* Name + count at the bottom-left 20px inset. The block reserves two
            lines and anchors its text to its foot, so the count keeps its
            20px baseline, a one-line name sits where a two-line name's second
            line would, and the band above lands at the same height on every
            card in the row. */}
        <div className={`flex ${NAME_MIN_H} shrink-0 flex-col justify-end px-5`}>
          {/* Cardo Bold 16/20, -0.02em. Cardo registers its own 700, so unlike
              Mier A the exported weight is safe to copy here. `capitalize`
              title-cases the display (names are often typed lowercase, e.g.
              "ai") while leaving the stored name — source of the frozen slug —
              alone. */}
          <h3 className="line-clamp-2 font-serif text-[16px] font-bold capitalize leading-5 tracking-[-0.02em] text-black/70">
            {name}
          </h3>
          {/* Mier A BOOK — the export reads `font-weight: 500`, which is Book
              in this family's inverted metadata, so 400 is the faithful value;
              500 would silently load Regular. Fill 0.7 × layer opacity 0.8 =
              0.56, the same alpha the bullet card's title settled on. */}
          <p className="mt-2 font-sans text-[12px] font-[400] leading-4 tracking-[0.05em] text-black/[0.56]">
            {count} {count === 1 ? 'Item' : 'Items'}
          </p>
        </div>
      </div>
    </>
  )

  if (href) {
    return (
      // Prefetch on approach, not on sight.
      //
      // The list page is a dynamic route, and Next's automatic prefetch stops
      // at its loading.tsx boundary — it fetches the skeleton, never the
      // bullets. So the skeleton appeared instantly and the content still cost
      // a full round trip on every click. prefetch={true} does fetch the whole
      // payload, but it fires for every card in the viewport, which on a
      // profile with twenty lists is twenty full page renders nobody asked for.
      //
      // Flipping it on hover buys the good half of both: nothing is fetched
      // until a pointer commits to a card, and then the WHOLE page is, during
      // the ~200-400ms the mouse still needs to arrive. By the time the click
      // lands the payload is in the router cache and the page renders from
      // memory — the same state the profile's tab switch is already in, which
      // is why that one feels instant and this one didn't.
      //
      // Once warm, it stays warm: flipping back on mouse-out would throw away
      // the fetch we just paid for, and Next dedupes repeat prefetches anyway.
      <Link
        href={href}
        prefetch={warm}
        onMouseEnter={() => setWarm(true)}
        onTouchStart={() => setWarm(true)}
        onFocus={() => setWarm(true)}
        className={className}
      >
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
