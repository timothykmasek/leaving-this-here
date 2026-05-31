'use client'

import { Children, type ReactNode } from 'react'

// Auto-scrolling marquee carousel. The track holds two copies of the items;
// the CSS animation translates it by -50% for a seamless loop. Pauses on hover
// (see .gem-marquee in globals.css) so cards stay clickable; edge fades blend
// cards into the paper as they enter/exit.
export function Carousel({ children }: { children: ReactNode }) {
  const items = Children.toArray(children)
  const track = [...items, ...items]

  return (
    <div className="relative overflow-hidden">
      <div className="gem-marquee flex w-max gap-4">
        {track.map((child, i) => (
          <div key={i} aria-hidden={i >= items.length} className="w-[280px] shrink-0 sm:w-[300px]">
            {child}
          </div>
        ))}
      </div>

      {/* edge fades */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-paper to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-paper to-transparent" />
    </div>
  )
}
