'use client'

import { useEffect, useRef, useState } from 'react'
import {
  sampleEdgeLightness,
  sampleImageField,
  onIdle,
  LIGHT_EDGE_THRESHOLD,
  SMALL_IMAGE_WIDTH,
  type ImageField,
} from '@/lib/imageLightness'

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
  onEdgeLightness,
  onExhausted,
  placeholderAspect,
}: {
  candidates: string[]
  alt?: string
  className?: string
  priority?: boolean
  fallback?: React.ReactNode
  // Reports whether the image that actually rendered has light edges, so the
  // card can draw a hairline when it would otherwise bleed into a white page.
  // null = couldn't measure (non-CORS host, decode failure); treat as "no".
  onEdgeLightness?: (light: boolean | null) => void
  // Fires when every candidate has failed and the fallback is what is on
  // screen. The caller cannot work this out for itself: holding an image URL
  // is not the same as that image rendering, and a link whose og:image 403s
  // for a visitor looks identical in the database to one that works.
  onExhausted?: (exhausted: boolean) => void
  /** Aspect to hold the card's space with until the image loads. */
  placeholderAspect?: string
}) {
  const [idx, setIdx] = useState(0)
  const [loaded, setLoaded] = useState(false)
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
    } else if (img && img.complete) {
      setLoaded(true)
    }
  }, [src])

  const exhausted = !src
  useEffect(() => {
    onExhausted?.(exhausted)
    // onExhausted is a fresh closure each render on most call sites; depending
    // on it would loop. The boolean is the whole signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhausted])

  // A small image is not a big image that needs stretching. An Instagram avatar
  // arrives at 150px; a card is 295-430px wide, so covering the plate with it
  // means a 2x blow-up that reads as broken. Measured after load, because the
  // natural size is not knowable before it.
  const [field, setField] = useState<ImageField | null>(null)
  useEffect(() => {
    setField(null)
    if (!src) return
    let cancelled = false
    const cancelIdle = onIdle(() => {
      sampleImageField(src).then((f) => {
        if (!cancelled && f && f.width && f.width < SMALL_IMAGE_WIDTH) setField(f)
      })
    })
    return () => { cancelled = true; cancelIdle() }
  }, [src])

  // Measure the src that WON the fallback chain, not candidates[0] — a card
  // that fell back from a 404 og to its screenshot is showing a different image.
  useEffect(() => {
    if (!src || !onEdgeLightness) return
    let cancelled = false
    const cancelIdle = onIdle(() => {
      sampleEdgeLightness(src).then((v) => {
        if (cancelled) return
        onEdgeLightness(v === null ? null : v >= LIGHT_EDGE_THRESHOLD)
      })
    })
    return () => { cancelled = true; cancelIdle() }
  }, [src, onEdgeLightness])

  if (!src) return <>{fallback}</>

  // Field mode: the picture at its own size, centred on a colour taken from
  // its own corners. Sized to a share of the card rather than to raw pixels so
  // it holds its proportions across breakpoints, and capped so a 300px logo
  // never crowds the plate.
  if (field) {
    return (
      <div
        className="flex w-full items-center justify-center"
        style={{
          aspectRatio: placeholderAspect,
          backgroundColor: field.background ?? '#f1f1f1',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={ref}
          key={src}
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          className="h-auto w-[42%] max-w-[168px] rounded-[6px]"
          onLoad={() => setLoaded(true)}
          onError={() => setIdx((i) => i + 1)}
        />
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      key={src}
      src={src}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      // Reserve height until the image arrives. A card renders at its image's
      // NATURAL aspect, so before that image loads it had no height at all —
      // which made the whole feed collapse to almost nothing on first paint.
      //
      // That wasn't just ugly, it doubled the work: the load-more sentinel sits
      // at the end of the grid with an 800px rootMargin, so against a collapsed
      // document it was already on screen and fired immediately, rendering two
      // pages of cards (96, not 48) and pulling twice the images before anyone
      // had scrolled. Measured: 96 cards and 58 below-fold images fetched on a
      // page nobody had touched.
      //
      // `placeholderAspect` is the type's own fallback plate shape, so the
      // reservation is roughly right rather than arbitrary; it's dropped the
      // moment the real image can speak for itself.
      style={loaded || !placeholderAspect ? undefined : { aspectRatio: placeholderAspect }}
      className={className}
      onLoad={() => setLoaded(true)}
      onError={() => setIdx((i) => i + 1)}
    />
  )
}
