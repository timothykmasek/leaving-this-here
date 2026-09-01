'use client'

// The contact-sheet band of a list's link images — a row of thumbs at one
// shared height, each keeping its own aspect, overrunning its container on both
// sides and dissolving into the surface behind it.
//
// With `drift`, the band becomes a slow marquee: the sequence is doubled and
// the track slides one full sequence-width on a linear loop, so the seam never
// shows. Constant SPEED px/s rather than a fixed duration — a long strip takes
// proportionally longer, so every card on the grid drifts at the same pace.
// The drift only engages when the sequence actually overruns the container
// (a two-thumb list stays a composed still, not a stuttering loop), never
// under prefers-reduced-motion, and pauses under the pointer — hovering the
// band means looking at it.
//
// The caller positions the band — it's absolutely placed — and owns the outer
// clipping, since the bleed depends on overflowing a parent with
// overflow-hidden.

import { useEffect, useRef, useState } from 'react'

const DEFAULT_FADE_W = '15.25%' // 45/295 on the card plate

// Drift pace, px/s. Slow enough to read as ambient, not as a ticker.
const SPEED = 14

export function LinkStrip({
  thumbs,
  className = '',
  style,
  /** Cap on one tile's width, as a % of the container. This is the knob that
   *  sets how many tiles you SEE: visible ≈ 100/cap whenever tiles clamp to it,
   *  which for Bulletin's landscape-heavy card images is most of the time. */
  thumbMaxWidth = '35%',
  fadeWidth = DEFAULT_FADE_W,
  /** The surface the band dissolves into. Faded to an alpha-0 version of ITSELF
   *  rather than `transparent`, which is transparent *black* and risks a grey
   *  cast mid-ramp. */
  fadeColor = '#F1F1F1',
  fadeColorTransparent = 'rgba(241,241,241,0)',
  /** Slow-scroll the band as a seamless loop. */
  drift = false,
}: {
  thumbs: string[]
  className?: string
  style?: React.CSSProperties
  thumbMaxWidth?: string
  fadeWidth?: string
  fadeColor?: string
  fadeColorTransparent?: string
  drift?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  // Seconds for one full sequence-width of travel; null = render the still.
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    if (!drift) return
    const wrap = wrapRef.current
    const group = groupRef.current
    if (!wrap || !group) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const measure = () => {
      const gw = group.scrollWidth
      // Only loop when there's genuinely more strip than window — repeating a
      // sequence that already fits reads as a glitch, not a carousel.
      setDuration(gw > wrap.clientWidth + 8 ? gw / SPEED : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(group)
    return () => ro.disconnect()
  }, [drift, thumbs])

  if (!thumbs.length) return null

  const tiles = thumbs.map((src, i) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={`${src}-${i}`}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      className="h-full w-auto shrink-0 bg-black/[0.04] object-cover"
      style={{ maxWidth: thumbMaxWidth }}
    />
  ))

  const driving = drift && duration !== null

  return (
    <div
      ref={wrapRef}
      className={`${driving ? 'overflow-hidden' : 'flex justify-center'} ${className}`}
      style={style}
    >
      {driving ? (
        <div
          className="strip-drift flex h-full w-max"
          style={{ animationDuration: `${duration}s` }}
        >
          <div ref={groupRef} className="flex h-full shrink-0">
            {tiles}
          </div>
          <div aria-hidden className="flex h-full shrink-0">
            {tiles}
          </div>
        </div>
      ) : (
        // Centred so it bleeds symmetrically, which is the rule that holds for
        // any number of tiles of any widths. groupRef stays attached so the
        // measurement can promote the still to a loop once images size in.
        <div ref={groupRef} className="flex h-full justify-center">
          {tiles}
        </div>
      )}

      <span
        aria-hidden
        className="absolute inset-y-0 left-0 z-[1]"
        style={{
          width: fadeWidth,
          background: `linear-gradient(90deg, ${fadeColor} 0%, ${fadeColorTransparent} 100%)`,
        }}
      />
      <span
        aria-hidden
        className="absolute inset-y-0 right-0 z-[1]"
        style={{
          width: fadeWidth,
          background: `linear-gradient(270deg, ${fadeColor} 0%, ${fadeColorTransparent} 100%)`,
        }}
      />
    </div>
  )
}
