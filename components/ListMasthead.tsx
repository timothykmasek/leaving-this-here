'use client'

// The masthead for a list page — the redesign that treats a list as a
// publication rather than a filtered view: a back link, an optional cover
// photo, the name, the description as real edited prose, and a meta line.
//
// Type follows the PROFILE, not the Figma export, per Tim:
//   • name        → Mier DemiBold 20/24, text-ink — same slot as the profile's
//                   own name (ProfileIdentity). This also happens to match the
//                   Figma panel exactly; only the export's `font-weight: 700`
//                   was wrong (that loads Bold, not DemiBold — 600 here).
//   • description → Cardo 14/22 -0.01em black/60 — the profile's bio treatment.
//                   Deliberately NOT the export's 14/18/-2%: an 18px leading on
//                   a multi-hundred-character paragraph is unreadably tight.
//   • meta        → Mier Book 12/16 0.05em black/0.56 — the card metadata voice,
//                   identical to the "145 Items" line on a CollectionCard. The
//                   mock set this at the title's own 20px; Tim chose the card
//                   voice so counts read the same everywhere.

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BracketLabel } from '@/components/BulletinHeader'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Aug 24". UTC parts on purpose — a locale/timezone-dependent format renders
 *  differently on the server than in the browser and trips hydration. */
function formatUpdated(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

export function ListMasthead({
  name,
  description,
  count,
  updatedAt,
  ownerName,
  backHref,
  backLabel,
  coverUrl,
  isPrivate = false,
  coverControl,
  editControl,
}: {
  name: string
  description?: string | null
  count: number
  /** ISO timestamp of the most recent add to this list, or null. */
  updatedAt?: string | null
  ownerName: string
  backHref: string
  backLabel: string
  coverUrl?: string | null
  isPrivate?: boolean
  /** Owner's cover affordance (add / replace / remove). */
  coverControl?: ReactNode
  /** Owner's edit affordance for name + description — one control, as today. */
  editControl?: ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const descRef = useRef<HTMLParagraphElement>(null)

  // Only offer more/less when the text is ACTUALLY cut off. A length threshold
  // would guess wrong at different widths; comparing scroll to client height
  // asks the browser what really happened.
  useEffect(() => {
    const el = descRef.current
    if (!el) return
    const measure = () => setClamped(el.scrollHeight > el.clientHeight + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [description, expanded])

  const updated = updatedAt ? formatUpdated(updatedAt) : null

  const title = (
    <h1 className="font-sans text-[20px] font-[600] leading-[24px] text-ink">{name}</h1>
  )

  return (
    // Full grid width, because the masthead below is laid out on the SAME
    // columns as the card grid (Masonry: 4 / 3 / 2 equal columns, 40px gaps).
    // Capping this at the Figma frame's 1184 was the earlier attempt at keeping
    // the description and the meta related, but it left the meta right-aligned
    // to an edge nothing else shared — which is precisely what made it look
    // arbitrary. Sharing the grid fixes it properly: the description spans the
    // first two columns, the meta lands in the last one, and its right edge
    // meets the last card's.
    <header className="pt-2">
      <Link
        href={backHref}
        className="inline-flex text-black/30 transition-colors hover:text-ink"
      >
        <BracketLabel>{backLabel}</BracketLabel>
      </Link>

      {coverUrl ? (
        // Cover. aspect-ratio holds the mock's 1184/480 on narrow screens, and
        // max-h caps it on wide ones — this grid runs to 1720, where a true
        // 2.47:1 would be a ~700px wall of photo before any content. Spanning
        // the full grid means its edges line up with the outer card columns.
        <div className="relative mt-6 aspect-[1184/480] max-h-[480px] w-full overflow-hidden rounded-[20px] bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          {/* The image dissolves into the page rather than ending on a hard
              edge, so the title below reads as dark type on paper. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-[linear-gradient(180deg,rgba(255,255,255,0)_0%,#FFFFFF_90%)]"
          />
          <div className="absolute inset-x-6 bottom-5 sm:inset-x-8 sm:bottom-6">{title}</div>
          {coverControl && <div className="absolute right-4 top-4">{coverControl}</div>}
        </div>
      ) : (
        // No cover is a real choice, not an empty frame — so this state gets a
        // composed row rather than a placeholder box.
        <div className="mt-6 flex items-end justify-between gap-4">
          {title}
          {coverControl}
        </div>
      )}

      {/* Same columns as the card grid below: 2 up / 3 at sm / 4 at lg, 40px
          gaps. The description spans two of them — a ~660px measure at desktop,
          which is a good line length for prose as well as a grid alignment —
          and the meta takes the last column. At lg that deliberately leaves the
          third column empty, so the space between them reads as structure
          rather than as drift. */}
      <div className="mt-8 grid grid-cols-1 gap-y-6 border-b border-black/[0.06] pb-8 sm:grid-cols-3 sm:gap-x-[40px] lg:grid-cols-4">
        <div className="sm:col-span-2">
          {description && (
            <>
              <p
                ref={descRef}
                className="font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60"
                style={
                  expanded
                    ? undefined
                    : { display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }
                }
              >
                {description}
              </p>
              {(clamped || expanded) && (
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-2 font-sans text-[12px] leading-4 tracking-[0.05em] text-black/30 underline transition-colors hover:text-ink"
                >
                  {expanded ? 'less' : 'more'}
                </button>
              )}
            </>
          )}
          {editControl && <div className={description ? 'mt-4' : undefined}>{editControl}</div>}
        </div>

        {/* Two identical grey lines stacked read as a shrug. This is a byline:
            the author leads (a list is someone's publication), the counts sit a
            rung lower on the ink ladder — which is how this system is documented
            to build hierarchy at one size. */}
        <div className="flex flex-col gap-1 sm:col-start-3 sm:items-end sm:text-right lg:col-start-4">
          <p className="font-sans text-[12px] leading-4 tracking-[0.05em] text-black/[0.56]">
            {ownerName}
          </p>
          <p className="font-sans text-[12px] leading-4 tracking-[0.05em] text-black/30">
            {count} {count === 1 ? 'Item' : 'Items'}
            {updated && ` · Updated ${updated}`}
            {isPrivate && ' · Private'}
          </p>
        </div>
      </div>
    </header>
  )
}
