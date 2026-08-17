'use client'

import { useEffect, useRef, useState } from 'react'
import { STEPS } from '@/lib/homeContent'

// ── How it works ────────────────────────────────────────────────────────────
// Four steps read as dots on a thread: scrolling through the section lights them
// one after another, so the connection draws itself. The stage on the right
// swaps a vignette per step. No autoplay anywhere.
//
// The stage sits directly on the dot grid — no border, no radius, no grey bed.
// The vignettes' own plates give it its silhouette.

const SHOT = {
  nigo: '/home/nigo-interior-article.png',
  plasticana: '/home/plasticana-fit-product.png',
  whr: '/home/western-hat-fit-product.png',
  vogue: '/home/rubiroa-fit-article.png',
  cherry: '/home/cherry-interior-location.png',
  rubirosa: '/home/rubirosa-fit-location.png',
  blouse: '/home/blouse-paris-location.jpg',
  noguchi: '/home/noguchi-interior.png',
}

/** The browser window used by vignettes 01 and 04 — same template, same 296px page area. */
function BrowserWindow({ address, children }: { address: string; children: React.ReactNode }) {
  return (
    <div className="w-[560px] overflow-hidden rounded-xl bg-paper shadow-[0_4px_18px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span aria-hidden className="h-2 w-2 rounded-full bg-black/[0.12]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-black/[0.12]" />
        <span aria-hidden className="h-2 w-2 rounded-full bg-black/[0.12]" />
        <span className="ml-2 flex-1 overflow-hidden rounded-full bg-card px-3 py-[5px]">
          <span className="whitespace-nowrap text-[12px] leading-4 tracking-[0.05em] text-black/70">{address}</span>
        </span>
        {/* The extension mark, sitting in the toolbar. */}
        <span aria-hidden className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/bulletin-icon.svg" alt="" className="block h-[15px] w-[15px]" />
        </span>
      </div>
      {children}
    </div>
  )
}

function VignetteSave() {
  return (
    <div className="relative flex h-[430px] w-[660px] items-start justify-center">
      <BrowserWindow address="nigo-interview.com">
        <div className="m-3 h-[296px] overflow-hidden rounded-lg bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOT.nigo} alt="" className="block h-full w-full object-cover" />
        </div>
      </BrowserWindow>
      {/* The save popup, anchored to the frame's bottom-right. */}
      <div className="absolute bottom-1.5 right-0 flex w-[280px] flex-col gap-3 rounded-xl bg-paper px-5 py-[18px] shadow-[0_4px_18px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/bulletin-icon.svg" alt="" aria-hidden className="block h-4 w-4" />
          <span className="text-[12px] leading-4 tracking-[0.05em] text-black/70">Saved to your page</span>
        </div>
        <span className="text-[12px] leading-4 tracking-[0.05em] text-black/30">Bulletin for Chrome</span>
      </div>
    </div>
  )
}

function VignetteLists() {
  return (
    <div className="flex h-[430px] w-[660px] items-start justify-center gap-7">
      <div className="grid grid-cols-[150px_150px] gap-4">
        {[SHOT.plasticana, SHOT.whr, SHOT.vogue].map((src, i) => (
          <div key={src} className="h-[150px] overflow-hidden rounded-[20px] bg-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="block h-full w-full object-cover"
              style={i === 2 ? { objectPosition: '50% 12%' } : undefined}
            />
          </div>
        ))}
        {/* The tile you'd drop the next bullet into. */}
        <div className="flex h-[150px] items-center justify-center rounded-[20px] bg-card text-[28px] leading-none text-black/30">
          +
        </div>
      </div>
      <div className="flex h-[316px] w-[220px] flex-col items-center justify-center gap-1 rounded-[20px] bg-card">
        <span className="text-[20px] leading-[26px] text-black">Fit Check</span>
        <span className="text-[12px] leading-4 tracking-[0.05em] text-black/50">[&nbsp;38 items&nbsp;]</span>
        <span className="mt-1 text-[12px] leading-4 tracking-[0.05em] text-black/30">yourbulletin.com/tim/fit-check</span>
      </div>
    </div>
  )
}

function VignetteSearch() {
  return (
    <div className="flex h-[430px] w-[660px] flex-col items-center gap-[22px]">
      <div className="flex h-12 w-[380px] items-center rounded-full bg-paper px-6 shadow-[0_4px_18px_rgba(0,0,0,0.10)]">
        <span className="text-[12px] leading-4 tracking-[0.05em] text-black/70">Paris</span>
      </div>
      {/* Results, tops aligned; the empty plate stands for what didn't match. */}
      <div className="flex items-start gap-5">
        <div className="h-[264px] w-[170px] overflow-hidden rounded-[20px] bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOT.cherry} alt="" className="block h-full w-full object-cover" />
        </div>
        <div className="h-[196px] w-[170px] overflow-hidden rounded-[20px] bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOT.rubirosa} alt="" className="block h-full w-full object-cover" />
        </div>
        <div className="h-[230px] w-[170px] overflow-hidden rounded-[20px] bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOT.blouse} alt="" className="block h-full w-full object-cover" />
        </div>
        <div className="h-[172px] w-[170px] rounded-[20px] bg-card opacity-45" />
      </div>
    </div>
  )
}

// The four-column plate grid inside the profile mock — mixed heights, two per column.
const MOCK_COLUMNS: { src: string; h: number; objectPosition?: string }[][] = [
  [{ src: SHOT.plasticana, h: 92 }, { src: SHOT.nigo, h: 76 }],
  [{ src: SHOT.noguchi, h: 118 }, { src: SHOT.blouse, h: 60 }],
  [{ src: SHOT.whr, h: 78 }, { src: SHOT.cherry, h: 104 }],
  [{ src: SHOT.vogue, h: 132, objectPosition: '50% 12%' }, { src: SHOT.rubirosa, h: 68 }],
]

function VignettePage() {
  return (
    <div className="flex h-[430px] w-[660px] flex-col items-center">
      <BrowserWindow address="yourbulletin.com/tim">
        <div className="relative m-3 h-[296px] overflow-hidden rounded-lg bg-paper">
          <div className="flex flex-col items-center gap-1 pt-[18px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bulletin-logo.png" alt="Bulletin" className="mb-2.5 block h-4 w-auto" />
            <span className="text-[18px] leading-6 text-black">Tim Masek</span>
            <span className="font-serif text-[13px] leading-[18px] text-black/50">
              Venture designer @ founders factory
            </span>
          </div>
          <div className="grid grid-cols-4 items-start gap-3 px-[18px] pt-[18px]">
            {MOCK_COLUMNS.map((col, i) => (
              <span key={i} className="flex flex-col gap-3.5">
                {col.map((p) => (
                  <span key={p.src} className="block overflow-hidden rounded-[10px] bg-card" style={{ height: p.h }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt=""
                      className="block h-full w-full object-cover"
                      style={p.objectPosition ? { objectPosition: p.objectPosition } : undefined}
                    />
                  </span>
                ))}
              </span>
            ))}
          </div>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[90px]"
            style={{ background: 'linear-gradient(0deg, #ffffff 36%, rgba(255,255,255,0) 100%)' }}
          />
        </div>
      </BrowserWindow>
    </div>
  )
}

const VIGNETTES = [VignetteSave, VignetteLists, VignetteSearch, VignettePage]

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)
  // Hovering the section suspends scroll control; a click holds for 4s.
  const hovering = useRef(false)
  const manualAt = useRef(0)

  useEffect(() => {
    const sec = sectionRef.current
    if (!sec) return
    let raf = 0
    // Measured per frame rather than on scroll events — the page may be
    // scrolled by a container rather than the window.
    const tick = () => {
      if (!hovering.current && !(manualAt.current && Date.now() - manualAt.current < 4000)) {
        const r = sec.getBoundingClientRect()
        const vh = window.innerHeight
        const p = Math.max(0, Math.min(0.999, (vh * 0.78 - r.top) / (r.height + vh * 0.25)))
        const n = Math.floor(p * 4)
        setActive((cur) => (n === cur ? cur : n))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const Vignette = VIGNETTES[active]

  return (
    <section
      ref={sectionRef}
      onMouseEnter={() => { hovering.current = true }}
      onMouseLeave={() => { hovering.current = false }}
      className="relative mx-auto w-[1330px] max-w-full"
    >
      <div className="mx-auto grid w-[1184px] max-w-full grid-cols-[340px_1fr] items-start gap-[60px] px-6 xl:px-0">
        {/* Left — four steps as dots on a thread. */}
        <div className="flex flex-col">
          {STEPS.map((s, n) => {
            const lit = n <= active
            return (
              <button
                key={s.key}
                type="button"
                onMouseEnter={() => { setActive(n); manualAt.current = Date.now() }}
                onClick={() => { setActive(n); manualAt.current = Date.now() }}
                className="relative flex gap-[22px] border-t border-black/[0.06] py-[26px] text-left"
              >
                <span aria-hidden className="relative w-2.5 flex-none">
                  <span
                    className="absolute left-0 top-[7px] h-[9px] w-[9px] rounded-full transition-[background-color,box-shadow] duration-[220ms]"
                    style={{
                      background: lit ? '#000' : 'transparent',
                      boxShadow: `inset 0 0 0 1px ${lit ? '#000' : 'rgba(0,0,0,0.18)'}`,
                    }}
                  />
                  {/* The thread to the next step; the last step has none. */}
                  <span
                    className="absolute bottom-[-27px] left-1 top-[22px] w-px transition-colors duration-[220ms]"
                    style={{
                      background:
                        n === STEPS.length - 1
                          ? 'transparent'
                          : n < active
                            ? 'rgba(0,0,0,0.28)'
                            : 'rgba(0,0,0,0.07)',
                    }}
                  />
                </span>
                <span className="flex flex-col gap-2">
                  <span
                    className="text-[20px] leading-[26px] transition-colors duration-[220ms]"
                    style={{ color: lit ? '#000' : 'rgba(0,0,0,0.3)' }}
                  >
                    {s.title}
                  </span>
                  <span
                    className="max-w-[300px] text-[12px] leading-4 tracking-[0.05em] transition-colors duration-[220ms]"
                    style={{ color: lit ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)' }}
                  >
                    {s.body}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Right — the stage. All four vignettes start at the same y, so the top
            edge never jumps between steps: anchored top, never centred. */}
        <div className="relative h-[556px] w-[784px] max-w-full overflow-hidden">
          <div className="absolute inset-0 flex items-start justify-center pt-6">
            <Vignette />
          </div>
        </div>
      </div>
    </section>
  )
}
