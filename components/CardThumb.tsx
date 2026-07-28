'use client'

import { useEffect, useRef, useState } from 'react'

// The card thumbnail image, with a graceful fallback chain. Given an ordered
// list of candidate URLs (og first, screenshot next — see cardImageCandidates),
// it renders the first that loads. On each <img> error it advances to the next
// candidate; when they're all exhausted it renders `fallback` (the dignified
// favicon+domain plate). This is what fixes a broken/404 og dropping to the
// screenshot we already captured, instead of straight to the plate.
//
// A plain <img> (not next/image) is deliberate: next.config sets
// images.unoptimized, so next/image adds no optimization here — but a plain
// <img> gives us a clean, reliable onError hook to drive the fallback chain.
export function CardThumb({
  candidates,
  alt = '',
  className = 'h-full w-full object-cover',
  priority = false,
  fallback = null,
}: {
  candidates: string[]
  alt?: string
  className?: string
  priority?: boolean
  fallback?: React.ReactNode
}) {
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLImageElement>(null)
  const src = candidates[idx]

  // A server-rendered <img> can 404 during initial HTML parse — before React
  // hydrates and attaches onError — so that error event is lost and the chain
  // would stall on a broken image. On mount (and whenever src changes) check
  // whether the current image has already failed (complete but zero-size) and
  // advance if so. onError below still handles failures that happen after
  // hydration. Together they make the fallback fire in both cases.
  useEffect(() => {
    const img = ref.current
    if (img && img.complete && img.naturalWidth === 0) {
      setIdx((i) => i + 1)
    }
  }, [src])

  if (!src) return <>{fallback}</>
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={src}
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      className={className}
      onError={() => setIdx((i) => i + 1)}
    />
  )
}
