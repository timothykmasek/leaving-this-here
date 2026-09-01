'use client'

import { useEffect, useRef, useState } from 'react'

// The private-beta landing (design handoff "Bulletin Landing", 2026-08-28).
// One viewport, no scroll: wordmark, tagline, and a CTA that unfolds into an
// inline email capture, over an animated dot grid. Replaced the v3 marketing
// home as `/` — that page is preserved unrouted in components/home/ (HeroField,
// HowItWorks, Featured, MobileHome).
//
// The grid here is the DS dot-ground's animated sibling: same 32px pitch, same
// #d9d9d9 resting grey, but each dot breathes on its own phase and darkens/
// swells near the pointer. It's a canvas because that's per-dot state — the
// tiled-gradient .dot-ground can't do it — and this page's opaque white ground
// covers the static body grid anyway. Honors prefers-reduced-motion by drawing
// the resting grid once.

const PITCH = 32
const POINTER_RADIUS = 150

type Dot = { x: number; y: number; phase: number; speed: number }

export function BetaLanding() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let dots: Dot[] = []
    let w = 0
    let h = 0
    let rafId = 0
    const mouse = { x: -9999, y: -9999 }

    const setup = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      w = parent.clientWidth
      h = parent.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      dots = []
      for (let y = PITCH / 2; y < h; y += PITCH) {
        for (let x = PITCH / 2; x < w; x += PITCH) {
          dots.push({ x, y, phase: Math.random() * Math.PI * 2, speed: 0.12 + Math.random() * 0.14 })
        }
      }
    }

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = '#d9d9d9'
      for (const d of dots) {
        ctx.beginPath()
        ctx.arc(d.x, d.y, 1, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const animate = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      const time = t / 1000
      for (const d of dots) {
        const idle = (Math.sin(time * d.speed + d.phase) + 1) / 2
        const dist = Math.hypot(d.x - mouse.x, d.y - mouse.y)
        const p = Math.max(0, 1 - dist / POINTER_RADIUS)
        const shade = Math.max(60, Math.round(217 - idle * 100 - p * 90))
        ctx.beginPath()
        ctx.fillStyle = `rgb(${shade},${shade},${shade})`
        ctx.arc(d.x, d.y, 1 + idle * 0.4 + p * 0.9, 0, Math.PI * 2)
        ctx.fill()
      }
      rafId = requestAnimationFrame(animate)
    }

    const onResize = () => setup()
    const onMove = (e: MouseEvent | TouchEvent) => {
      const r = canvas.getBoundingClientRect()
      const p = 'touches' in e ? e.touches[0] : e
      if (!p) return
      mouse.x = p.clientX - r.left
      mouse.y = p.clientY - r.top
    }

    setup()
    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('touchmove', onMove)

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) drawStatic()
    else rafId = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchmove', onMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!value) return
    // Optimistic by design: one forward path, no loading or error state. The
    // route answers ok even on a duplicate; keepalive lets the POST survive
    // the visitor closing the tab on the thank-you.
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
    <div className="relative flex h-[100dvh] w-full flex-col items-center justify-center gap-8 overflow-hidden bg-white p-6 text-center">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/bulletin-logo.png"
        alt="Bulletin"
        className="relative z-[1] block h-auto w-[min(280px,45vw)]"
      />

      <p className="relative z-[1] text-[20px] font-normal leading-[1.3] text-black">
        Bookmark in public
        <span className="mt-1 block text-[15px] text-black/70">(or don&rsquo;t).</span>
      </p>

      {submitted ? (
        <p className="beta-in relative z-[1] px-7 py-3 text-[16px] text-black/70">
          You&rsquo;re on the list.
        </p>
      ) : revealed ? (
        // flex-wrap: the 260px input + button row outgrows a phone screen and
        // the no-scroll container would clip it — on small screens the button
        // drops under the input instead.
        <form onSubmit={handleSubmit} className="beta-in relative z-[1] flex flex-wrap items-center justify-center gap-2.5">
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
        <button type="button" onClick={() => setRevealed(true)} className={`${pill} relative z-[1]`}>
          Private Beta Access
        </button>
      )}
    </div>
  )
}
