'use client'

import { useEffect, useRef, useState } from 'react'
import { DEPTH_HERO_CARDS, captionMask } from '@/lib/homeContent'
import { withBulletinUtm } from '@/lib/outboundUrl'

import { DotGridCanvas } from './DotGridCanvas'

// ── Depth hero (design handoff "Bulletin Hero — drifting cards", 2026-09-01) ─
// The beta landing's lockup and animated dot grid, with the v3 hero's nine
// link cards flying through 3D depth behind it: each card loops from far
// (z −1200) to near (+1200) behind a perspective camera, fading and blurring
// in at the far edge and out again before it hits the lens. Scrolling kicks
// the loop forward with momentum that decays back to the ambient drift.
//
// Merges three sources, per Tim:
//   • handoff  → depth loop, slot layout, fade/blur ramps, clear zone, lockup
//   • v3 hero  → the nine real HERO_CARDS (links, captions, hover-to-pause)
//   • landing  → DotGridCanvas ground + the unfold email-capture CTA
//
// The handoff's motion constants are the design, not defaults to tune. Two
// departures from it, both deliberate: real cards keep their three v3 plate
// sizes (scaled) instead of one uniform PrimaryCard box, and the depth
// advance is accumulated per card so hovering pauses just that card — the
// handoff computes z from global time, which can't pause one card without
// snapping it when it resumes.

// Fixed offsets from screen center (px, before perspective scaling). A
// hand-authored list clumped several slots into the same sector, and when one
// of those flew near the camera (projected outward, 2×+ scale) it swept
// straight across its sector-mates. So: a golden-angle spiral — each slot's
// heading advances ~137.5°, which never revisits a sector for many steps, and
// the radius cycles through five rings (420–660) so the returns that do share
// a rough heading sit at different distances. Squashed to a landscape ellipse
// (x×1.12, y×0.78). Phases are computed in the loop (i·7 mod 24 — coprime, so
// depth neighbors are also far apart in space).
const GOLDEN_ANGLE = 2.399963
const SLOTS = Array.from({ length: 24 }, (_, i) => {
  const radius = 420 + (i % 5) * 60
  return {
    x: Math.round(Math.cos(i * GOLDEN_ANGLE) * radius * 1.12),
    y: Math.round(Math.sin(i * GOLDEN_ANGLE) * radius * 0.78),
  }
})

const TOTAL_DEPTH = 2400 // z loop range: −1200 far → +1200 near
const BASE_SPEED = 50 // px of depth per second, ambient
const PERSPECTIVE = 1600
const DEAD_ZONE = 300 // px radius around the lockup cards must clear
// v3 plates (168×168 / 240×160 / 200×280) scaled to sit near the handoff's
// ~118×176 on-screen card at z=0. Trimmed 0.65 → 0.58 with the 24-card
// fleet — smaller footprints, fewer kissing edges.
const CARD_SCALE = 0.58

type Body = {
  el: HTMLElement
  w: number
  h: number
  x: number
  y: number
  phase: number
  /** Accumulated depth travelled — per card, so a hover pauses only it. */
  depth: number
  paused: boolean
  /** Narrow viewports fly half the fleet — 24 cards drown a phone screen. */
  hidden: boolean
}

export function DepthHero() {
  const fieldRef = useRef<HTMLDivElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const field = fieldRef.current
    if (!field) return

    const els = Array.from(field.querySelectorAll<HTMLElement>('a[data-depth-card]'))
    const bodies: Body[] = els.map((el, i) => ({
      el,
      w: Number(el.dataset.w),
      h: Number(el.dataset.h),
      ...SLOTS[i % SLOTS.length],
      phase: ((i * 7) % SLOTS.length) / SLOTS.length,
      depth: 0,
      paused: false,
      hidden: false,
    }))

    // The slot envelope and clear zone are authored for a desktop viewport.
    // On a phone (±740px offsets, 390px screen) every card lives off-screen
    // and the field reads as dead — so both scale to the viewport: offsets
    // shrink toward the visible frame, and the clear zone shrinks with them
    // (at 300px it would span the whole phone and pin every card invisible).
    // A narrow screen also flies half the fleet at double the ambient speed:
    // 24 cards drown a phone, and with no wheel to kick the loop the drift
    // has to carry the liveliness by itself.
    let sx = 1
    let sy = 1
    let clearZone = DEAD_ZONE
    let speed = BASE_SPEED
    const applyViewport = () => {
      const narrow = window.innerWidth < 640
      sx = Math.min(1, Math.max(0.3, window.innerWidth / 1440))
      sy = Math.min(1, Math.max(0.55, window.innerHeight / 1000))
      clearZone = Math.min(DEAD_ZONE, window.innerWidth * 0.42)
      speed = narrow ? BASE_SPEED * 2.2 : BASE_SPEED
      bodies.forEach((b, i) => {
        b.hidden = narrow && i % 2 === 1
        b.el.style.display = b.hidden ? 'none' : ''
      })
    }
    applyViewport()
    window.addEventListener('resize', applyViewport)

    const place = (b: Body) => {
      const z =
        ((((b.phase * TOTAL_DEPTH + b.depth) % TOTAL_DEPTH) + TOTAL_DEPTH) % TOTAL_DEPTH) -
        TOTAL_DEPTH / 2
      // Fade in, hold, fade out before the card would clip through the
      // camera. Both ramps are tighter than the handoff's (in 6→22%, out
      // 80→95%) — a 24-card fleet needs it. The late fade-in matters most:
      // at far depths perspective compresses every slot toward the center,
      // so distant cards cluster into a tiny-card swarm around the lockup.
      // Holding them invisible until 20→35% means a card only appears once
      // perspective has spread it out to its own patch of sky, and ~16 of
      // the 24 are airborne at once instead of ~21.
      const norm = (z + TOTAL_DEPTH / 2) / TOTAL_DEPTH
      let opacity
      if (norm < 0.25) opacity = 0
      else if (norm < 0.4) opacity = (norm - 0.25) / 0.15
      else if (norm <= 0.7) opacity = 1
      else if (norm <= 0.85) opacity = 1 - (norm - 0.7) / 0.15
      else opacity = 0

      // Clear zone: fade a card toward 0 when its projected footprint nears
      // the lockup, so cards clear it dynamically at every depth and scale.
      // Blur tracks the DEPTH fade only, from before the clear-zone multiply:
      // a card held down by the clear zone should be transparent, not a
      // permanent blur smear parked next to the lockup.
      const blur = (1 - Math.min(1, opacity)) * 6

      const ex = b.x * sx
      const ey = b.y * sy
      const sf = PERSPECTIVE / (PERSPECTIVE - z)
      const dist = Math.hypot(ex * sf, ey * sf)
      const halfDiag = (Math.hypot(b.w, b.h) / 2) * sf
      opacity *= Math.max(0, Math.min(1, (dist - clearZone) / (halfDiag + 60)))
      b.el.style.transform = `translate3d(${ex}px, ${ey}px, ${z}px)`
      b.el.style.opacity = String(opacity)
      b.el.style.filter = blur > 0.2 ? `blur(${blur.toFixed(1)}px)` : 'none'
      // Paint order = depth order. Without this the browser flattens the 3D
      // children in DOM order, and a far card can paint OVER a near one —
      // overlaps read as glitch instead of occlusion.
      b.el.style.zIndex = String(1400 + Math.round(z))
      // A near-invisible card shouldn't intercept clicks meant for the lockup.
      b.el.style.pointerEvents = opacity > 0.35 ? 'auto' : 'none'
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // One static frame: each card parked at its phase position.
      bodies.forEach(place)
      return () => window.removeEventListener('resize', applyViewport)
    }

    const cleanups: (() => void)[] = []
    for (const b of bodies) {
      const enter = () => { b.paused = true }
      const leave = () => { b.paused = false }
      b.el.addEventListener('mouseenter', enter)
      b.el.addEventListener('mouseleave', leave)
      cleanups.push(() => {
        b.el.removeEventListener('mouseenter', enter)
        b.el.removeEventListener('mouseleave', leave)
      })
    }

    let scrollVelocity = 0
    let lastTouchY: number | null = null
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      scrollVelocity += e.deltaY * 0.6
    }
    const onTouchStart = (e: TouchEvent) => { lastTouchY = e.touches[0]?.clientY ?? null }
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY
      if (y === undefined || lastTouchY === null) return
      scrollVelocity += (lastTouchY - y) * 0.6
      lastTouchY = y
    }
    const root = field.parentElement ?? field
    root.addEventListener('wheel', onWheel, { passive: false })
    root.addEventListener('touchstart', onTouchStart, { passive: true })
    root.addEventListener('touchmove', onTouchMove, { passive: true })

    let raf = 0
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const advance = speed * dt + scrollVelocity * dt * 60
      scrollVelocity *= 0.96
      for (const b of bodies) {
        if (b.hidden) continue
        if (!b.paused) b.depth += advance
        place(b)
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(raf)
      cleanups.forEach((fn) => fn())
      window.removeEventListener('resize', applyViewport)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('touchstart', onTouchStart)
      root.removeEventListener('touchmove', onTouchMove)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    // Optimistic by design, matching BetaLanding: one forward path, keepalive
    // so the POST survives the visitor closing the tab on the thank-you.
    fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: value }),
      keepalive: true,
    }).catch(() => {})
    setSubmitted(true)
  }

  const pill =
    'font-serif text-[15px] inline-flex h-[46px] items-center justify-center whitespace-nowrap ' +
    'rounded-full border border-black/[0.28] bg-white px-7 text-black ' +
    'transition-[border-color] duration-150 ease-out hover:border-black/[0.55]'

  return (
    // fixed inset-0, not h-[100dvh]: mobile Safari and in-app browsers
    // resolve dvh against a viewport that isn't what's on screen (URL bar
    // states), which floated the lockup high on phones. A fixed box IS the
    // visual frame, whatever the browser chrome is doing.
    <div className="fixed inset-0 overflow-hidden bg-white">
      <DotGridCanvas />

      {/* The perspective camera holding the drifting cards. z-0 makes it a
          stacking context, so the cards' own depth-sorted z-indexes (up to
          ~2600) stay inside it instead of rising above the z-10 lockup. */}
      <div
        ref={fieldRef}
        className="absolute inset-0 z-0 overflow-hidden"
        style={{ perspective: `${PERSPECTIVE}px` }}
      >
        {DEPTH_HERO_CARDS.map((c, i) => {
          const w = Math.round(c.w * CARD_SCALE)
          const h = Math.round(c.h * CARD_SCALE)
          return (
            <a
              key={c.key}
              data-depth-card
              data-w={w}
              data-h={h}
              href={withBulletinUtm(c.href, 'home')}
              target="_blank"
              rel="noopener"
              className="absolute left-1/2 top-1/2 block will-change-transform"
              // Cards start invisible; the first frame places and fades them in.
              style={{ width: w, marginLeft: -w / 2, marginTop: -h / 2, opacity: 0 }}
            >
              <span
                className="relative block overflow-hidden rounded-[20px] bg-card"
                style={{ width: w, height: h }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.image}
                  alt=""
                  className="block h-full w-full object-cover"
                  style={c.objectPosition ? { objectPosition: c.objectPosition } : undefined}
                />
                {/* PrimaryCard's white protection gradient, per the handoff. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[21%]"
                  style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 100%)' }}
                />
              </span>
              {/* v3's one-line caption, dissolving into the plate's last 46px. */}
              <span
                className="mt-3 block overflow-hidden whitespace-nowrap text-left text-[12px] leading-4 tracking-[0.05em] text-black/50"
                style={{
                  width: w,
                  WebkitMaskImage: captionMask(w),
                  maskImage: captionMask(w),
                }}
              >
                {c.caption}
              </span>
            </a>
          )
        })}
      </div>

      {/* Centered lockup, above the field. pointer-events-none so the
          full-viewport overlay doesn't eat the cards' hovers and clicks —
          the CTA/form opt back in. (Not a translated abs-pos box: that
          shrink-to-fits to half the viewport and wraps the email row.) */}
      {/* Same lockup as the live BetaLanding — logo, tagline, pill — not the
          handoff's 900-weight H1 treatment (Tim, 2026-09-01). */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-8 p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/bulletin-logo.png"
          alt="Bulletin"
          className="block h-auto w-[min(280px,45vw)]"
        />
        <p className="text-[20px] font-normal leading-[1.3] text-black">
          Bookmark in public
          <span className="mt-1 block text-[15px] text-black/70">(or don&rsquo;t).</span>
        </p>

        {submitted ? (
          <p className="beta-in px-7 py-3 text-[16px] text-black/70">You&rsquo;re on the list.</p>
        ) : revealed ? (
          <form onSubmit={handleSubmit} className="beta-in pointer-events-auto flex flex-wrap items-center justify-center gap-2.5">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              className="font-serif h-[46px] w-[260px] rounded-full border border-black/[0.15] bg-white px-[18px] text-[15px] text-black outline-none focus:border-black/40"
            />
            <button type="submit" className={pill}>
              Request Access
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setRevealed(true)} className={`${pill} pointer-events-auto`}>
            Private Beta Access
          </button>
        )}
      </div>
    </div>
  )
}
