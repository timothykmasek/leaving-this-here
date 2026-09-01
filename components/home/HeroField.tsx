'use client'

import { useEffect, useRef } from 'react'
import { HERO_CARDS, HERO_LISTS, HERO_PROFILES, captionMask } from '@/lib/homeContent'
import Link from 'next/link'

// ── Hero: the drifting field ────────────────────────────────────────────────
// Thirteen cards on a 1330×1230 canvas — 9 links, 2 ghost list plates, 2 profile
// plates. Each drifts on its own heading, bounces off the others (and off the
// copy block and masthead), and is pulled slowly back toward where it started so
// the composition never thins out into bare patches. Ported from the handoff
// prototype; the constants below are the design, not defaults to tune.
//
// The canvas is a fixed 1330px because every start position is absolute. On a
// narrower viewport it crops symmetrically rather than reflowing — the drift
// bounds are already set wider than the visible frame, so wall bounces happen
// off-screen either way.

const LEFT = -40
const RIGHT = 1370
const TOP = 4
const BOT = 1160
const SPEED = 17 // px/s base
const MAX = 26 // px/s ceiling

// Rectangles the cards bounce off: the copy block, and the masthead patch.
const WALLS = [
  { x: 320, y: 160, w: 690, h: 200 },
  { x: 496, y: 0, w: 338, h: 108 },
]

type Body = {
  el: HTMLElement
  w: number
  h: number
  x: number
  y: number
  ox: number
  oy: number
  vx: number
  vy: number
  hx: number
  hy: number
  paused: boolean
}

export function HeroField() {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    // Below `lg` the whole desktop tree is display:none, so every offsetLeft /
    // offsetWidth reads 0. Seeding the bodies from that gives zero-size cards
    // homed at the origin, and they stay that way if the window is later
    // widened past the breakpoint. So the field only starts once it is actually
    // laid out, and re-seeds whenever the breakpoint is crossed.
    const mq = window.matchMedia('(min-width: 1024px)')
    let stop: (() => void) | undefined
    const sync = () => {
      stop?.()
      stop = mq.matches ? start() : undefined
    }
    sync()
    mq.addEventListener('change', sync)
    return () => {
      mq.removeEventListener('change', sync)
      stop?.()
    }
  }, [])

  // Seeds the bodies from the laid-out DOM and runs the loop. Returns a
  // teardown, or undefined when there is nothing laid out to animate.
  function start(): (() => void) | undefined {
    const root = rootRef.current
    if (!root || root.offsetParent === null) return undefined

    const els = Array.from(root.querySelectorAll<HTMLElement>('a[data-drift]'))
    if (!els.length) return undefined

    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    const cleanups: (() => void)[] = []

    const bodies: Body[] = els.map((el) => {
      // The body is the PLATE's width × the element's full height (plate +
      // caption), so captions collide too and every card behaves identically.
      const plate = el.firstElementChild as HTMLElement
      const w = plate.offsetWidth
      const h = el.offsetHeight
      const ang = rnd(0, Math.PI * 2)
      const sp = rnd(SPEED * 0.75, SPEED * 1.25)
      let vy = Math.sin(ang) * sp
      // Keep some vertical component so nothing slides along a horizontal rail.
      if (Math.abs(vy) < sp * 0.5) vy = (vy < 0 ? -1 : 1) * sp * 0.5
      const b: Body = {
        el,
        w,
        h,
        x: el.offsetLeft,
        y: Math.min(el.offsetTop, BOT - h),
        ox: el.offsetLeft,
        oy: el.offsetTop,
        vx: Math.cos(ang) * sp,
        vy,
        hx: el.offsetLeft,
        hy: el.offsetTop,
        paused: false,
      }
      // Hovering pauses a card so it can be clicked.
      const enter = () => { b.paused = true }
      const leave = () => { b.paused = false }
      el.addEventListener('mouseenter', enter)
      el.addEventListener('mouseleave', leave)
      cleanups.push(() => {
        el.removeEventListener('mouseenter', enter)
        el.removeEventListener('mouseleave', leave)
      })
      return b
    })

    // One entry per currently-overlapping pair, so the velocity exchange fires
    // once per contact instead of every frame (which reads as judder).
    const touching = new Set<string>()
    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      // Clamp dt so a dropped frame can't teleport a card across the canvas.
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now

      for (const p of bodies) {
        if (!p.paused) {
          p.x += p.vx * dt
          p.y += p.vy * dt
        }
        // Weak spring home: bumps knock the composition about and it slowly
        // reassembles itself.
        p.vx += (p.hx - p.x) * 0.09 * dt
        p.vy += (p.hy - p.y) * 0.09 * dt
        if (p.x < LEFT) { p.x = LEFT; p.vx = Math.abs(p.vx) }
        if (p.x + p.w > RIGHT) { p.x = RIGHT - p.w; p.vx = -Math.abs(p.vx) }
        if (p.y < TOP) { p.y = TOP; p.vy = Math.abs(p.vy) }
        if (p.y + p.h > BOT) { p.y = BOT - p.h; p.vy = -Math.abs(p.vy) }
      }

      for (let i = 0; i < bodies.length; i++) {
        for (let j = i + 1; j < bodies.length; j++) {
          const a = bodies[i]
          const c = bodies[j]
          const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x)
          const oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y)
          const key = `${i}:${j}`
          if (ox <= 0 || oy <= 0) { touching.delete(key); continue }
          // Separate the pair fully along the axis of least overlap, then
          // EXCHANGE velocity on that axis — averaging makes colliding cards
          // adopt one heading and travel together, sitting inside each other.
          if (ox < oy) {
            const dir = a.x < c.x ? -1 : 1
            a.x += (ox / 2) * dir
            c.x -= (ox / 2) * dir
            if (!touching.has(key)) { const t = a.vx; a.vx = c.vx; c.vx = t }
          } else {
            const dir = a.y < c.y ? -1 : 1
            a.y += (oy / 2) * dir
            c.y -= (oy / 2) * dir
            if (!touching.has(key)) { const t = a.vy; a.vy = c.vy; c.vy = t }
          }
          touching.add(key)
        }

        const a = bodies[i]
        for (const w of WALLS) {
          const ox = Math.min(a.x + a.w, w.x + w.w) - Math.max(a.x, w.x)
          const oy = Math.min(a.y + a.h, w.y + w.h) - Math.max(a.y, w.y)
          if (ox <= 0 || oy <= 0) continue
          if (ox < oy) { const d = a.x < w.x ? -1 : 1; a.x += ox * d; a.vx = d * Math.abs(a.vx) }
          else { const d = a.y < w.y ? -1 : 1; a.y += oy * d; a.vy = d * Math.abs(a.vy) }
        }
      }

      for (const p of bodies) {
        const sp = Math.hypot(p.vx, p.vy)
        // Ceiling, and a gentle nudge so nothing stalls to a halt.
        if (sp > MAX) { p.vx *= MAX / sp; p.vy *= MAX / sp }
        else if (sp < SPEED * 0.5) { p.vx *= 1.02; p.vy *= 1.02 }
        p.el.style.transform = `translate(${(p.x - p.ox).toFixed(2)}px,${(p.y - p.oy).toFixed(2)}px)`
      }

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf)
      cleanups.forEach((fn) => fn())
      // Drop any transform so a re-seed starts from the CSS positions.
      for (const p of bodies) p.el.style.transform = ''
    }
  }

  return (
    <div className="relative w-full overflow-hidden">
      {/* Sign up rides the VIEWPORT's right edge, not the fixed canvas — on a
          viewport narrower than 1330 the canvas crops, and a canvas-anchored
          link gets sliced in half. It's not one of the physics obstacles, so
          moving it out of the canvas costs nothing. */}
      <Link
        href="/start"
        className="absolute right-6 top-[38px] z-[7] text-[12px] leading-4 tracking-[0.05em] text-black/70 transition-colors hover:text-black"
      >
        Sign up
      </Link>

      <section
        ref={rootRef}
        className="relative mx-auto h-[1230px] w-[1330px] overflow-hidden"
      >
      {/* Masthead. The white patch masks the dot grid behind the wordmark, and
          the cards bounce off it (WALLS[1]) rather than sliding under. */}
      <div aria-hidden className="absolute left-[516px] top-0 z-[7] h-[100px] w-[298px] bg-paper" />
      <Link href="/" aria-label="Bulletin home" className="absolute left-[596px] top-[26px] z-[7] block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bulletin-logo.png" alt="Bulletin" className="block h-10 w-auto" />
      </Link>

      {/* Link cards */}
      {HERO_CARDS.map((c) => (
        <a
          key={c.key}
          data-drift
          href={c.href}
          target="_blank"
          rel="noopener"
          className="absolute will-change-transform"
          style={{ left: c.left, top: c.top }}
        >
          <div
            className="relative overflow-hidden rounded-[20px] bg-card"
            style={{ width: c.w, height: c.h }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={c.image}
              alt=""
              className="block h-full w-full object-cover"
              style={c.objectPosition ? { objectPosition: c.objectPosition } : undefined}
            />
          </div>
          {/* One line, left-aligned to the plate, exactly the plate's width, and
              dissolving into the last 46px rather than wrapping or clipping. */}
          <span
            className="mt-4 block overflow-hidden whitespace-nowrap text-[12px] leading-4 tracking-[0.05em] text-black/50"
            style={{
              width: c.w,
              WebkitMaskImage: captionMask(c.w),
              maskImage: captionMask(c.w),
            }}
          >
            {c.caption}
          </span>
        </a>
      ))}

      {/* Ghost list plates */}
      {HERO_LISTS.map((l) => (
        <a
          key={l.key}
          data-drift
          href={l.href}
          target="_blank"
          rel="noopener"
          className="group absolute block h-[180px] w-[179px] rounded-[20px] bg-card transition-colors duration-[140ms] hover:bg-[rgb(237,237,237)] will-change-transform"
          style={{ left: l.left, top: l.top }}
        >
          {/* First child is the plate the physics measures — here the card IS
              the plate, so an inner box carries the same box. */}
          <span className="absolute inset-0 block">
            <span className="absolute inset-x-0 top-[58px] text-center text-[32px] leading-10 text-black">+</span>
            <span className="absolute inset-x-0 bottom-[22px] text-center text-[12px] leading-4 tracking-[0.05em] text-black/50">
              Add to “{l.label}”
            </span>
          </span>
        </a>
      ))}

      {/* Profile plates — name + count, no caption beneath. */}
      {HERO_PROFILES.map((p) => (
        <a
          key={p.key}
          data-drift
          href={p.href}
          target="_blank"
          rel="noopener"
          className="absolute block h-[168px] w-[168px] rounded-[20px] bg-card will-change-transform"
          style={{ left: p.left, top: p.top }}
        >
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <span className="font-serif text-[22px] leading-[26px] text-black">{p.name}</span>
            <span className="text-[12px] leading-4 tracking-[0.05em] text-black/50">[&nbsp;{p.count}&nbsp;]</span>
          </span>
        </a>
      ))}

      {/* Copy block — sits above the field, and the cards bounce off it. */}
      <div className="absolute left-[335px] top-[178px] z-[6] w-[660px] text-center">
        {/* Mier Book, matching the two section titles below — not the handoff's
            Cardo, per Tim. */}
        <h1 className="text-[44px] font-normal leading-[52px] text-black">
          A home for your links
        </h1>
        <p className="mt-4 text-[12px] leading-4 tracking-[0.05em] text-black/50">
          Collect, organize and share links worth keeping
        </p>
        <div className="mt-7 flex justify-center">
          <Link
            href="/start"
            className="flex h-11 w-[270px] items-center justify-center rounded-full border border-black/15 text-[12px] tracking-[0.05em] text-black/70 transition-colors hover:border-black hover:text-black"
          >
            Sign up
          </Link>
        </div>
      </div>

        {/* Fades the field into the page. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] h-[300px]"
          style={{
            background:
              'linear-gradient(0deg, #ffffff 22%, rgba(255,255,255,0.82) 62%, rgba(255,255,255,0) 100%)',
          }}
        />
      </section>
    </div>
  )
}
