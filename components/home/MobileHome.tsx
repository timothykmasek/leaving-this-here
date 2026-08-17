'use client'

import { useEffect, useRef, useState } from 'react'
import { STEPS } from '@/lib/homeContent'
import { Featured } from '@/components/home/Featured'

// ── Mobile homepage ─────────────────────────────────────────────────────────
// Deliberately pared back from desktop. Two things are gone on purpose:
//   • No hero physics. Drifting, colliding cards under a thumb — with no hover
//     to pause them — is the wrong trade on touch, so the hero is a static
//     collage that rides up and clears out as you scroll.
//   • No staged module. A stage that hides three of four steps costs a tap
//     each, so all four steps are open with their dots filled.

// The nine links the four image slots draw from.
const POOL: { src: string; caption: string; href: string }[] = [
  { src: '/home/rubirosa-fit-location.png', caption: 'Rubirosa’s — Shop, Paris 2e', href: 'https://share.google/gNrQPgJ7vDw5qQvZB' },
  { src: '/home/western-hat-fit-product.png', caption: 'Western Hydrodynamic Research', href: 'https://www.whr.institute/' },
  { src: '/home/cherry-interior-location.png', caption: 'Cherry — Paris, 7ème', href: 'https://share.google/gNrQPgJ7vDw5qQvZB' },
  { src: '/home/noguchi-interior.png', caption: 'Noguchi Museum — Akari 1A', href: 'https://shop.noguchi.org/products/akari-1a' },
  { src: '/home/plasticana-fit-product.png', caption: 'Plasticana — Woven leather loafers', href: 'https://merci-merci.com/en/products/plasticana-mules-opana-chanvre' },
  { src: '/home/nigo-interior-article.png', caption: 'Interview — Inside Nigo’s archive', href: 'https://www.usm.com/en-uk/stories/nigo-from-japan-with-love' },
  { src: '/home/rubiroa-fit-article.png', caption: 'Vogue — Lauren Rubinski', href: 'https://www.vogue.com/article/lauren-rubinski-rubirosas-9-5-style' },
  { src: '/home/eou-website-fit.png', caption: 'eou.world — Korean streetwear', href: 'https://eouglobal.com/' },
  { src: '/home/blouse-paris-location.jpg', caption: 'La Blouse de Lyon — Paris', href: 'https://www.instagram.com/lablousedelyon/?hl=en' },
]

const SLOT_HEIGHTS = [224, 160, 196, 160] // a, b (left column) · c, d (right)
const CAPTION_MASK = 'linear-gradient(90deg,#000 72%,transparent 100%)'

function Slot({ index, height }: { index: number; height: number }) {
  const item = POOL[index]
  return (
    <a href={item.href} target="_blank" rel="noopener noreferrer" className="block">
      <span className="block overflow-hidden rounded-[20px] bg-card" style={{ height }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.src} alt="" className="block h-full w-full object-cover" />
      </span>
      <span
        className="mt-3 block overflow-hidden whitespace-nowrap text-[12px] leading-4 tracking-[0.05em] text-black/50"
        style={{ WebkitMaskImage: CAPTION_MASK, maskImage: CAPTION_MASK }}
      >
        {item.caption}
      </span>
    </a>
  )
}

/** Mobile browser-window template, shared by steps 01 and 04. */
function MiniBrowser({ address, pageHeight, children }: { address: string; pageHeight: number; children?: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-xl bg-paper shadow-[0_4px_18px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)]">
      <div className="flex items-center gap-1.5 px-2.5 pt-2.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-black/[0.12]" />
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-black/[0.12]" />
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-black/[0.12]" />
        <span className="ml-1.5 flex-1 overflow-hidden rounded-full bg-card px-2 py-1">
          <span className="block truncate text-[11px] leading-4 text-black/70">{address}</span>
        </span>
        <span aria-hidden className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/bulletin-icon.svg" alt="" className="block h-3 w-3" />
        </span>
      </div>
      <div className="relative m-2.5 overflow-hidden rounded-lg bg-card" style={{ height: pageHeight }}>
        {children}
      </div>
    </div>
  )
}

function MobileVignette({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="relative w-[292px]">
        <MiniBrowser address="nigo-interview.com" pageHeight={150}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/home/nigo-interior-article.png" alt="" className="block h-full w-full object-cover" />
        </MiniBrowser>
        <div className="absolute -bottom-3 right-0 flex w-[170px] flex-col gap-2 rounded-xl bg-paper px-3.5 py-3 shadow-[0_4px_18px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/bulletin-icon.svg" alt="" aria-hidden className="block h-3.5 w-3.5" />
            <span className="text-[11px] leading-4 text-black/70">Saved to your page</span>
          </div>
          <span className="text-[11px] leading-4 text-black/30">Bulletin for Chrome</span>
        </div>
      </div>
    )
  }
  if (step === 1) {
    return (
      <div className="flex w-[292px] items-start gap-3">
        <div className="grid grid-cols-2 gap-2.5">
          {['/home/plasticana-fit-product.png', '/home/western-hat-fit-product.png', '/home/rubiroa-fit-article.png'].map((s, i) => (
            <span key={s} className="block h-[68px] w-[68px] overflow-hidden rounded-2xl bg-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s}
                alt=""
                className="block h-full w-full object-cover"
                style={i === 2 ? { objectPosition: '50% 12%' } : undefined}
              />
            </span>
          ))}
          <span className="flex h-[68px] w-[68px] items-center justify-center rounded-2xl bg-card text-[20px] leading-none text-black/30">
            +
          </span>
        </div>
        <div className="flex h-[144px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl bg-card">
          <span className="text-[15px] leading-5 text-black">Fit Check</span>
          <span className="text-[11px] leading-4 text-black/50">[&nbsp;38&nbsp;]</span>
        </div>
      </div>
    )
  }
  if (step === 2) {
    return (
      <div className="w-[292px]">
        <div className="flex h-10 w-[200px] items-center rounded-full bg-paper px-4 shadow-[0_4px_18px_rgba(0,0,0,0.10)]">
          <span className="text-[12px] leading-4 tracking-[0.05em] text-black/70">Paris</span>
        </div>
        <div className="mt-4 flex items-start gap-2.5">
          {[
            { src: '/home/cherry-interior-location.png', h: 132 },
            { src: '/home/rubirosa-fit-location.png', h: 98 },
            { src: '/home/blouse-paris-location.jpg', h: 115 },
          ].map((r) => (
            <span key={r.src} className="block w-[90px] overflow-hidden rounded-2xl bg-card" style={{ height: r.h }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.src} alt="" className="block h-full w-full object-cover" />
            </span>
          ))}
        </div>
      </div>
    )
  }
  return (
    <div className="w-[292px]">
      <MiniBrowser address="yourbulletin.com/tim" pageHeight={200}>
        <div className="absolute inset-0 bg-paper">
          <div className="flex flex-col items-center gap-0.5 pt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bulletin-logo.png" alt="Bulletin" className="mb-1.5 block h-3 w-auto" />
            <span className="text-[13px] leading-4 text-black">Tim Masek</span>
            <span className="font-serif text-[11px] leading-4 text-black/50">Venture designer @ founders factory</span>
          </div>
          <div className="grid grid-cols-4 items-start gap-1.5 px-3 pt-3">
            {[
              [{ src: '/home/plasticana-fit-product.png', h: 54 }, { src: '/home/nigo-interior-article.png', h: 44 }],
              [{ src: '/home/noguchi-interior.png', h: 68 }, { src: '/home/blouse-paris-location.jpg', h: 34 }],
              [{ src: '/home/western-hat-fit-product.png', h: 46 }, { src: '/home/cherry-interior-location.png', h: 60 }],
              [{ src: '/home/rubiroa-fit-article.png', h: 76 }, { src: '/home/rubirosa-fit-location.png', h: 40 }],
            ].map((col, i) => (
              <span key={i} className="flex flex-col gap-1.5">
                {col.map((p) => (
                  <span key={p.src} className="block overflow-hidden rounded-md bg-card" style={{ height: p.h }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt="" className="block h-full w-full object-cover" />
                  </span>
                ))}
              </span>
            ))}
          </div>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-14"
            style={{ background: 'linear-gradient(0deg, #ffffff 36%, rgba(255,255,255,0) 100%)' }}
          />
        </div>
      </MiniBrowser>
    </div>
  )
}

export function MobileHome() {
  const collageRef = useRef<HTMLDivElement>(null)
  // Which pool entry each of the four image slots is currently showing.
  const [slots, setSlots] = useState([0, 1, 2, 3])
  const [fading, setFading] = useState<number | null>(null)

  // The collage rides up past the page and thins out, so the links clear the
  // screen before the first step arrives.
  useEffect(() => {
    const el = collageRef.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let start: number | null = null
    const tick = () => {
      // Above `lg` this whole tree is display:none, which measures as 0 and
      // would freeze a stale baseline in `start`. Forget it while hidden so the
      // baseline is retaken the next time the collage is actually laid out.
      if (el.offsetParent === null) {
        start = null
        raf = requestAnimationFrame(tick)
        return
      }
      // Measured on the UNTRANSFORMED parent: reading the moving element itself
      // feeds its own transform back into the progress and slams it to the end
      // within 200px.
      const parent = el.parentElement
      if (parent) {
        const top = parent.getBoundingClientRect().top
        if (start == null) start = top
        const p = Math.max(0, Math.min(1, (start - top) / 420))
        const rise = p * 180
        el.style.transform = `translateY(${(-rise).toFixed(1)}px)`
        el.style.opacity = (1 - p * 0.9).toFixed(3)
        // A transform doesn't free the space the collage vacates, so riding up
        // while fading out left a tall dead band before the first step. Pulling
        // the same distance off the bottom margin brings the rest of the page up
        // in step. Safe against feedback: margin-bottom moves what's BELOW, so
        // the measured parent's top — the progress input — never changes.
        el.style.marginBottom = `${(-rise).toFixed(1)}px`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Each slot trades its card for one that is NOT on screen, round-robin, so
  // the hero is never always the same four. The live slot contents are mirrored
  // into a ref: picking the next card is a side effect, and doing that inside a
  // setState updater lets React run it twice (StrictMode) and double-fire the
  // swap timer, which strands a slot at opacity 0.
  const slotsRef = useRef(slots)
  useEffect(() => { slotsRef.current = slots }, [slots])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let turn = 0
    let swapTimer: ReturnType<typeof setTimeout> | undefined
    const id = setInterval(() => {
      const slot = turn % 4
      turn += 1
      const free = POOL.map((_, i) => i).filter((i) => !slotsRef.current.includes(i))
      if (!free.length) return
      const next = free[Math.floor(Math.random() * free.length)]
      setFading(slot)
      swapTimer = setTimeout(() => {
        setSlots((c) => c.map((v, i) => (i === slot ? next : v)))
        setFading(null)
      }, 280)
    }, 3200)
    return () => { clearInterval(id); if (swapTimer) clearTimeout(swapTimer) }
  }, [])

  const slotClass = (i: number) =>
    `transition-opacity duration-[260ms] ${fading === i ? 'opacity-0' : 'opacity-100'}`

  return (
    <div className="mx-auto w-full max-w-[390px]">
      <div className="flex items-center justify-between px-6 pt-[18px]">
        <a href="/" aria-label="Bulletin home" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bulletin-logo.png" alt="Bulletin" className="block h-[26px] w-auto" />
        </a>
        <a href="/start" className="text-[12px] leading-4 tracking-[0.05em] text-black/70">Sign up</a>
      </div>

      <section className="px-6 pt-10">
        {/* Mier Book, matching the section titles — not the handoff's Cardo, per Tim. */}
        <h1 className="text-center text-[32px] font-normal leading-[38px] text-black">
          A home for your links
        </h1>
        <p className="mt-3 text-center text-[12px] leading-4 tracking-[0.05em] text-black/50">
          Collect, organize and share links worth keeping
        </p>
        <a
          href="/start"
          className="mt-[22px] flex h-12 items-center justify-center rounded-full border border-black/15 text-[12px] tracking-[0.05em] text-black/70"
        >
          Sign up
        </a>

        <div className="relative mt-[34px]">
          <div
            ref={collageRef}
            className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3 will-change-[transform,opacity]"
          >
            <div className="flex flex-col gap-[26px]">
              <div className={slotClass(0)}><Slot index={slots[0]} height={SLOT_HEIGHTS[0]} /></div>
              <div className={slotClass(1)}><Slot index={slots[1]} height={SLOT_HEIGHTS[1]} /></div>
              <a href="/tim/the-fit-check" target="_blank" rel="noopener noreferrer" className="flex h-[150px] flex-col items-center justify-center gap-2.5 rounded-[20px] bg-card">
                <span className="text-[26px] leading-8 text-black">+</span>
                <span className="text-[12px] leading-4 tracking-[0.05em] text-black/50">Add to “Fit Check”</span>
              </a>
            </div>
            <div className="flex flex-col gap-[26px] pt-11">
              <div className={slotClass(2)}><Slot index={slots[2]} height={SLOT_HEIGHTS[2]} /></div>
              <div className={slotClass(3)}><Slot index={slots[3]} height={SLOT_HEIGHTS[3]} /></div>
              <a href="/remi" target="_blank" rel="noopener noreferrer" className="flex h-[150px] flex-col items-center justify-center gap-1 rounded-[20px] bg-card">
                <span className="font-serif text-[22px] leading-[26px] text-black">Remi</span>
                <span className="text-[12px] leading-4 tracking-[0.05em] text-black/50">[&nbsp;96 items&nbsp;]</span>
              </a>
            </div>
          </div>
          {/* Fades the collage out at its foot, bleeding into both gutters. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 bottom-0 h-[220px]"
            style={{
              background: 'linear-gradient(0deg, #ffffff 22%, rgba(255,255,255,0.82) 62%, rgba(255,255,255,0) 100%)',
            }}
          />
        </div>
      </section>

      {/* Broken by hand on mobile: the clause break reads better than letting
          342px of column decide where the line turns. */}
      <h2 className="px-6 pt-10 text-center text-[26px] leading-8 text-black">
        Connect the dots,<br />one bullet at a time.
      </h2>

      {/* All four steps open — nothing is hidden, so no active state. */}
      <section className="px-6 pt-10">
        {STEPS.map((s, n) => (
          <div key={s.key} className="pb-11">
            <div className="flex gap-4">
              <span aria-hidden className="relative w-[9px] flex-none">
                <span className="absolute left-0 top-[7px] h-[9px] w-[9px] rounded-full bg-black shadow-[inset_0_0_0_1px_#000]" />
                {n < STEPS.length - 1 && (
                  <span className="absolute bottom-[-44px] left-1 top-[22px] w-px bg-black/[0.28]" />
                )}
              </span>
              <div className="flex flex-1 flex-col gap-2">
                <span className="text-[18px] leading-6 text-black">{s.title}</span>
                <span className="text-[12px] leading-4 tracking-[0.05em] text-black/50">{s.body}</span>
                <div className="pt-4">
                  <MobileVignette step={n} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </section>

      <Featured compact />
    </div>
  )
}
