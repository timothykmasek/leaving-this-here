'use client'

import { useState } from 'react'
import { DotGridCanvas } from './DotGridCanvas'

// The private-beta landing (design handoff "Bulletin Landing", 2026-08-28).
// One viewport, no scroll: wordmark, tagline, and a CTA that unfolds into an
// inline email capture, over an animated dot grid. Replaced the v3 marketing
// home as `/` — that page is preserved unrouted in components/home/ (HeroField,
// HowItWorks, Featured, MobileHome).
//
// The grid (DotGridCanvas) breathes per-dot and swells near the pointer; this
// page's opaque white ground covers the static body grid, so the canvas is the
// only grid visible here.

export function BetaLanding() {
  const [revealed, setRevealed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [email, setEmail] = useState('')

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
      <DotGridCanvas />

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
