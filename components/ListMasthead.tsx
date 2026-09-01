'use client'

// The masthead for a list page, per the ProjectX list frame: the list's name
// as a full-width editorial display — Cardo at poster scale, one line, running
// off the right edge into white when it's long — over a quiet meta row (back
// link left, bullet count right). The attribution ("A list by Tim Masek")
// moved up into the header's centred tagline slot, descriptions dropped from
// display entirely, and the cover band is retired — the name IS the identity
// now. Legacy props (description, cover, strip) are still accepted so older
// call sites compile, but nothing renders them.
//
// Type:
//   • name  → Cardo 400, clamp(52px→180px at 13.5vw), 1.22 leading, -7%
//             tracking, black/70 — the frame's 180/220/-0.07em at desktop.
//   • meta  → Mier 500 12/16 +0.05em black/56 — the card metadata voice, same
//             as before; the back link keeps its existing BracketLabel dress.

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BracketLabel } from '@/components/BulletinHeader'

export function ListMasthead({
  name,
  count,
  backHref,
  backLabel,
  isPrivate = false,
  editControl,
  // Retired by the display masthead — accepted so call sites compile.
  description: _description,
  ownerName: _ownerName,
  coverUrl: _coverUrl,
  stripThumbs: _stripThumbs,
  coverControl: _coverControl,
}: {
  name: string
  count: number
  backHref: string
  backLabel: string
  isPrivate?: boolean
  /** Owner's edit affordance for the list — the same pencil as before. */
  editControl?: ReactNode
  description?: string | null
  ownerName?: string
  coverUrl?: string | null
  stripThumbs?: string[]
  coverControl?: ReactNode
}) {
  // The right-edge fade only earns its place when the name actually runs past
  // the container — a short name ends in air, not in a dissolve.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])

  return (
    <header className="group pt-2">
      {/* Display title. One line always — length is handled by the fade, not
          by wrapping, so the masthead's height never moves. */}
      {/* Frame gives the title ~90px of air below the header and as much again
          before the meta row — the spaciousness IS the composition. */}
      <div className="relative mt-6 overflow-hidden sm:mt-12">
        <h1
          ref={titleRef}
          className="whitespace-nowrap font-serif font-normal leading-[1.22] tracking-[-0.07em] text-black/70 text-[clamp(52px,13.5vw,180px)]"
        >
          {name}
        </h1>
        {overflowing && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-[100px] bg-gradient-to-r from-white/0 to-white sm:w-[220px]"
          />
        )}
      </div>

      {/* Meta row: back link (current styling) and the owner's pencil on the
          left, the count on the right where the last card column ends. */}
      <div className="mt-10 flex items-center justify-between gap-4 pb-8 sm:mt-24">
        <span className="flex items-center gap-2">
          <Link
            href={backHref}
            className="inline-flex text-black/30 transition-colors hover:text-ink"
          >
            <BracketLabel>{backLabel}</BracketLabel>
          </Link>
          {editControl && (
            <span className="flex items-center text-black/35 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
              {editControl}
            </span>
          )}
        </span>
        <span className="font-sans text-[12px] font-medium leading-4 tracking-[0.05em] text-black/[0.56]">
          {count} {count === 1 ? 'Bullet' : 'Bullets'}
          {isPrivate && ' · Private'}
        </span>
      </div>
    </header>
  )
}
