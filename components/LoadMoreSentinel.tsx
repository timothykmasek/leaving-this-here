'use client'

import { useEffect, useRef } from 'react'

// How many bullets a grid renders at once. A power profile holds ~1000
// bullets and a big list ~170; mounting them all floods the DOM and fires
// every image request in one burst. Grids render a page at a time and grow as
// the sentinel scrolls into view, so only what's near the viewport ever mounts.
export const RENDER_PAGE = 48

// Invisible tripwire at the tail of a grid. When it scrolls within 800px of
// the viewport it calls onReach, which reveals the next RENDER_PAGE.
export function LoadMoreSentinel({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onReach() },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onReach])
  return <div ref={ref} aria-hidden className="col-span-full h-px" />
}
