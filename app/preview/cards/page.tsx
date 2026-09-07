'use client'

import { useEffect, useMemo, useState } from 'react'
import { PrimaryCard } from '@/components/PrimaryCard'
import { BracketLabel } from '@/components/BulletinHeader'
import { resolveCategory } from '@/lib/cardFormat'

// Ship 02 scratchpad — the shared DS "Primary Card" primitive rendered against
// REAL Bulletin bullets (fetched 2026-08-14, one/two per live card_type). This
// page is not linked anywhere; it exists to feel the card + its per-type mask
// aspects before anything touches the live grid. Delete when Ship 02 lands.
//
// 2026-09-05: the one-slider fade tuner grew into the FADE LAB — every knob of
// the foot-fade (band height, curve, onset/landing, ceiling, stops, tint), the
// image-erasing wrapper mask, and the plate's corner paint, all driving the
// CSS variables the real PrimaryCard reads. Nothing here is a mock; ship a
// setting by copying the CSS it prints into PrimaryCard's defaults.

const SAMPLES: any[] = [
  { card_type: 'article', url: 'https://bento.me/en/home', title: 'Link in bio tool: Everything you are, in one simple link | Linktree', image_url: 'https://cdn.prod.website-files.com/666255f7f2126f4e8cec6f8f/66a8993e0e8d98b8822b7c50_Linktree-OpenGraphPreview.jpg', screenshot_url: null, favicon_url: 'https://cdn.prod.website-files.com/666255f7f2126f4e8cec6f8f/66693601ff7950e64e66b56b_favicon.png', list: 'Portfolio Tools' },
  { card_type: 'article', url: 'https://www.samsara.com/uk/', title: 'Samsara: The leading fleet management and safety platform', image_url: 'https://images.ctfassets.net/bx9krvy0u3sx/7cxFtCvfGbzKg8s56mzITz/7131f933583277365836fa7697d196e1/Og-Image_Homepage-US-UK-CA-en.png', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'product', url: 'https://www.myhabits.io/', title: 'MyHabits.io — Google Sheets Template', image_url: 'https://myhabits.io/og-image.png', screenshot_url: null, favicon_url: null, list: 'Habit Systems' },
  { card_type: 'product', url: 'https://www.mentorpass.co/me/thomaslalas', title: '1:1 Consulting with Thomas Lalas', image_url: 'https://cdn.filestackcontent.com/uWZ8ofMpSxSKArzd5JKq', screenshot_url: null, favicon_url: 'https://www.mentorpass.co/favicon.ico', list: null },
  { card_type: 'composite', url: 'https://www.linkedin.com/pulse/40-things', title: '40 Things I Had to Unlearn—And Lessons I Actually Learned', image_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/og/cd0ef8a6-adbe-4460-b4cd-b9ff277ed031.jpg', screenshot_url: null, favicon_url: 'https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca', list: 'Founder Lessons' },
  { card_type: 'fullbleed', url: 'https://graphpaper-tokyo.com/collections/mens', title: 'Graphpaper official site', image_url: 'https://cdn.shopify.com/s/files/1/0614/6231/5221/files/Graphpaper_OG_24bfd3f9-27f7-412f-8eee-9a81e55df789.jpg?v=1643957040', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'fullbleed', url: 'https://thesleepcode.com/products/serotonin-bath-soak-salt', title: 'Serotonin Bath Soak Salt', image_url: 'http://thesleepcode.com/cdn/shop/files/Serotonin_Bath_Soak_Salt.png?crop=center&height=1200&v=1784575222&width=1200', screenshot_url: null, favicon_url: null, list: 'The Fit Check' },
  { card_type: 'screenshot', url: 'https://www.valarian.com/', title: 'Valarian | Sovereign Intelligence', image_url: 'https://www.valarian.com/assets/og/sharecard-4.png', screenshot_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/7337077b-252b-43c1-983e-2527dee99c9b.webp', favicon_url: null, list: null },
  { card_type: 'screenshot', url: 'https://www.withcoverage.com/', title: 'WithCoverage - The Risk Management Solution For Ambitious Businesses', image_url: 'https://www.withcoverage.com/images/og/withcoverage-social.png', screenshot_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/thumb/14327ffa-073c-4fe2-9bfd-67f6c627bdc0.webp', favicon_url: null, list: 'AI Finance' },
  // Domain-resolved categories (Video/Music/Podcast/Social) — show the new
  // affordances. card_type is deliberately "wrong" (article/screenshot) to prove
  // the URL signal overrides the noisy classifier.
  { card_type: 'article', url: 'https://www.youtube.com/watch?v=PHe0bXAIuk0', title: 'How The Economic Machine Works by Ray Dalio', image_url: 'https://i.ytimg.com/vi/PHe0bXAIuk0/maxresdefault.jpg', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'screenshot', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', title: 'The Tim Ferriss Show — Naval Ravikant', image_url: null, screenshot_url: null, favicon_url: 'https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico', list: 'Deep Listens' },
  { card_type: 'screenshot', url: 'https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX', title: 'Random Access Memories — Daft Punk', image_url: null, screenshot_url: null, favicon_url: null, list: null },
]

/* ── The parameter space ─────────────────────────────────────────────────── */

type Curve = 'linear' | 'smoothstep' | 'smootherstep' | 'ease-in' | 'ease-out'

type Params = {
  bandH: number // band height, % of card (or px when unit = 'px')
  unit: '%' | 'px'
  onset: number // % of band where the fade BEGINS (0 = at the band's top)
  land: number // % of band where the fade reaches its ceiling
  curve: Curve
  gamma: number // exponent for ease-in / ease-out
  maxA: number // ceiling opacity — < 1 leaves the image faintly visible
  stops: number // ramp segments (more = smoother interpolation)
  color: string // what the image fades TO (white = the page)
  maskOn: boolean
  maskStart: number // % of card where the image starts to erase
  maskEnd: number // % of card where the image is fully gone
  dots: boolean // render on the dot-grid ground, like the live profile
}

// The shipped fade IS a plain two-stop linear over a 16% band, with the mask
// at 90→96% of the card — so this preset reproduces production stop for stop.
const SHIPPED: Params = {
  bandH: 16, unit: '%', onset: 0, land: 100, curve: 'linear', gamma: 2,
  maxA: 1, stops: 1, color: '#FFFFFF', maskOn: true, maskStart: 90,
  maskEnd: 96, dots: false,
}

// The handoff's own fade (Figma "Rectangle 5102"): a plain two-stop linear
// over a fixed 45px band.
const FIGMA: Params = {
  ...SHIPPED, unit: 'px', bandH: 45, curve: 'linear', stops: 1, land: 100,
}

// A gentler starting point for "the gradient is too intense": a shorter band,
// a later mask, and the same easing.
const GENTLE: Params = {
  ...SHIPPED, bandH: 16, land: 100, curve: 'smootherstep', maskStart: 94,
  maskEnd: 98,
}

const PRESETS: Array<[string, Params]> = [
  ['shipped', SHIPPED],
  ['figma linear', FIGMA],
  ['gentle', GENTLE],
]

function ease(t: number, curve: Curve, gamma: number): number {
  switch (curve) {
    case 'linear': return t
    case 'smoothstep': return t * t * (3 - 2 * t)
    case 'smootherstep': return t * t * t * (t * (t * 6 - 15) + 10)
    case 'ease-in': return Math.pow(t, gamma)
    case 'ease-out': return 1 - Math.pow(1 - t, gamma)
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  if (Number.isNaN(n) || full.length !== 6) return [255, 255, 255]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Sample the eased curve into a CSS gradient across the band.
function buildFade(p: Params): string {
  const [r, g, b] = hexToRgb(p.color)
  const rgba = (a: number) => `rgba(${r},${g},${b},${+a.toFixed(3)})`
  const stops: string[] = []
  if (p.onset > 0) stops.push(`${rgba(0)} 0%`)
  const n = Math.max(1, p.stops)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const pos = p.onset + t * (p.land - p.onset)
    stops.push(`${rgba(ease(t, p.curve, p.gamma) * p.maxA)} ${+pos.toFixed(1)}%`)
  }
  if (p.land < 100) stops.push(`${rgba(p.maxA)} 100%`)
  return `linear-gradient(180deg,${stops.join(',')})`
}

function buildMask(p: Params): string {
  return `linear-gradient(180deg,#000 ${p.maskStart}%,transparent ${p.maskEnd}%)`
}

// The plate's corner-AA paint tracks the mask: transparent until just past
// mask-start, solid white by mask-end (shipped: 92→96 against a 90→96 mask).
function buildPlateFade(p: Params): string {
  const from = Math.min(p.maskStart + 2, p.maskEnd - 1)
  return `linear-gradient(180deg,rgba(255,255,255,0) ${from}%,#FFFFFF ${p.maskEnd}%)`
}

function cssOut(p: Params): string {
  const lines = [
    `--card-foot-fade-h: ${p.bandH}${p.unit};`,
    `--card-foot-fade: ${buildFade(p)};`,
  ]
  if (p.maskOn) {
    lines.push(`--card-mask: ${buildMask(p)};`)
    lines.push(`--card-plate-fade: ${buildPlateFade(p)};`)
  } else {
    lines.push('/* mask disabled — production always masks; this is a debug view */')
  }
  return lines.join('\n')
}

const STORE = 'bulletin-fade-lab'
const SLOTS = ['A', 'B', 'C'] as const

/* ── Small controls ──────────────────────────────────────────────────────── */

function Slider({
  label, min, max, step = 1, value, onChange, fmt = (v) => String(v), disabled,
}: {
  label: string; min: number; max: number; step?: number; value: number
  onChange: (v: number) => void; fmt?: (v: number) => string; disabled?: boolean
}) {
  return (
    <label className={`flex items-center gap-3 ${disabled ? 'opacity-30 pointer-events-none' : ''}`}>
      <span className="label w-[104px] shrink-0 text-black/50">{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full min-w-[120px] accent-black"
      />
      <span className="w-[52px] shrink-0 text-right font-sans text-[13px] font-[600] tabular-nums text-ink">
        {fmt(value)}
      </span>
    </label>
  )
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 font-sans text-[12px] tracking-[0.05em] transition-colors ${
        active ? 'border-black bg-black text-white' : 'border-black/15 text-black/50 hover:border-black/40'
      }`}
    >
      {children}
    </button>
  )
}

// The curve, drawn: alpha (up) over band position (right), with the sampled
// stops the CSS actually emits marked as dots.
function CurveGraph({ p }: { p: Params }) {
  const W = 224, H = 72
  const pts: Array<[number, number]> = []
  for (let x = 0; x <= W; x++) {
    const pos = (x / W) * 100
    let a: number
    if (pos <= p.onset) a = 0
    else if (pos >= p.land) a = p.maxA
    else a = ease((pos - p.onset) / (p.land - p.onset), p.curve, p.gamma) * p.maxA
    pts.push([x, H - 4 - a * (H - 8)])
  }
  const n = Math.max(1, p.stops)
  const dots = Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n
    const pos = p.onset + t * (p.land - p.onset)
    return [
      (pos / 100) * W,
      H - 4 - ease(t, p.curve, p.gamma) * p.maxA * (H - 8),
    ]
  })
  return (
    <svg width={W} height={H} className="rounded-[8px] border border-[#EBEBEB] bg-[#FAFAF9]">
      <line x1={0} y1={H - 4} x2={W} y2={H - 4} stroke="#EBEBEB" />
      <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#111" strokeWidth={1.5} />
      {dots.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={2.5} fill="#111" />
      ))}
    </svg>
  )
}

/* ── The lab ─────────────────────────────────────────────────────────────── */

export default function CardsPreview() {
  const [p, setP] = useState<Params>(SHIPPED)
  const [copied, setCopied] = useState(false)
  const [slots, setSlots] = useState<Record<string, Params | null>>({ A: null, B: null, C: null })

  // Restore the last session's settings + save slots.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE)
      if (raw) {
        const saved = JSON.parse(raw)
        if (saved.current) setP({ ...SHIPPED, ...saved.current })
        if (saved.slots) setSlots((s) => ({ ...s, ...saved.slots }))
      }
    } catch {}
  }, [])
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ current: p, slots }))
    } catch {}
  }, [p, slots])

  const set = (patch: Partial<Params>) => setP((prev) => ({ ...prev, ...patch }))
  const css = useMemo(() => cssOut(p), [p])
  const gammaCurve = p.curve === 'ease-in' || p.curve === 'ease-out'

  const vars = {
    '--card-foot-fade-h': `${p.bandH}${p.unit}`,
    '--card-foot-fade': buildFade(p),
    '--card-mask': p.maskOn ? buildMask(p) : 'none',
    '--card-plate-fade': p.maskOn ? buildPlateFade(p) : 'none',
  } as React.CSSProperties

  const copy = () => {
    navigator.clipboard.writeText(css).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    })
  }

  return (
    <main className={`min-h-screen ${p.dots ? 'dot-ground' : ''}`}>
      {/* ── Control deck — sticky, so the cards scroll under it. ── */}
      <div className="sticky top-0 z-20 border-b border-[#EBEBEB] bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1208px] px-6 py-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BracketLabel>Fade lab</BracketLabel>
            {PRESETS.map(([name, preset]) => (
              <Chip
                key={name}
                active={JSON.stringify({ ...p, dots: false }) === JSON.stringify({ ...preset, dots: false })}
                onClick={() => set({ ...preset, dots: p.dots })}
              >
                {name}
              </Chip>
            ))}
            <span className="mx-1 h-4 w-px bg-black/10" />
            {SLOTS.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <Chip active={!!slots[s]} onClick={() => slots[s] && set({ ...slots[s]!, dots: p.dots })}>
                  {slots[s] ? `load ${s}` : `${s} —`}
                </Chip>
                <button
                  onClick={() => setSlots((prev) => ({ ...prev, [s]: p }))}
                  className="font-sans text-[11px] text-black/40 hover:text-black"
                  title={`Save current settings to slot ${s}`}
                >
                  save
                </button>
              </span>
            ))}
            <span className="mx-1 h-4 w-px bg-black/10" />
            <Chip active={p.dots} onClick={() => set({ dots: !p.dots })}>dot ground</Chip>
            <Chip active={!p.maskOn} onClick={() => set({ maskOn: !p.maskOn })}>mask off</Chip>
          </div>

          <div className="grid gap-x-10 gap-y-2 lg:grid-cols-3">
            {/* Band + range */}
            <div className="flex flex-col gap-2">
              <Slider
                label={`band height (${p.unit})`}
                min={p.unit === '%' ? 8 : 20} max={p.unit === '%' ? 50 : 160}
                value={p.bandH} onChange={(v) => set({ bandH: v })}
                fmt={(v) => `${v}${p.unit}`}
              />
              <Slider label="onset (% band)" min={0} max={60} value={p.onset}
                onChange={(v) => set({ onset: Math.min(v, p.land - 5) })} fmt={(v) => `${v}%`} />
              <Slider label="lands (% band)" min={50} max={100} value={p.land}
                onChange={(v) => set({ land: Math.max(v, p.onset + 5) })} fmt={(v) => `${v}%`} />
              <div className="flex items-center gap-3">
                <span className="label w-[104px] shrink-0 text-black/50">band unit</span>
                <Chip active={p.unit === '%'} onClick={() => set({ unit: '%', bandH: 16 })}>%</Chip>
                <Chip active={p.unit === 'px'} onClick={() => set({ unit: 'px', bandH: 45 })}>px</Chip>
              </div>
            </div>

            {/* Curve */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span className="label w-[104px] shrink-0 text-black/50">curve</span>
                <select
                  value={p.curve}
                  onChange={(e) => set({ curve: e.target.value as Curve })}
                  className="rounded-[8px] border border-black/15 bg-white px-2 py-1 font-sans text-[13px]"
                >
                  {(['smoothstep', 'smootherstep', 'linear', 'ease-in', 'ease-out'] as Curve[]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <Slider label="gamma" min={1} max={4} step={0.1} value={p.gamma}
                onChange={(v) => set({ gamma: v })} fmt={(v) => v.toFixed(1)} disabled={!gammaCurve} />
              <Slider label="ceiling opacity" min={0.5} max={1} step={0.01} value={p.maxA}
                onChange={(v) => set({ maxA: v })} fmt={(v) => v.toFixed(2)} />
              <Slider label="stops" min={1} max={24} value={p.stops}
                onChange={(v) => set({ stops: v })} />
              <div className="flex items-center gap-3">
                <span className="label w-[104px] shrink-0 text-black/50">fade to</span>
                <input
                  type="color" value={p.color}
                  onChange={(e) => set({ color: e.target.value })}
                  className="h-7 w-10 cursor-pointer rounded border border-black/15"
                />
                <span className="font-sans text-[13px] tabular-nums text-ink">{p.color.toUpperCase()}</span>
              </div>
            </div>

            {/* Mask + curve preview */}
            <div className="flex flex-col gap-2">
              <Slider label="mask starts (% card)" min={70} max={98} value={p.maskStart}
                onChange={(v) => set({ maskStart: Math.min(v, p.maskEnd - 2) })}
                fmt={(v) => `${v}%`} disabled={!p.maskOn} />
              <Slider label="mask ends (% card)" min={80} max={100} value={p.maskEnd}
                onChange={(v) => set({ maskEnd: Math.max(v, p.maskStart + 2) })}
                fmt={(v) => `${v}%`} disabled={!p.maskOn} />
              <div className="flex items-start gap-3 pt-1">
                <CurveGraph p={p} />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={copy}
                    className="rounded-[8px] border border-black bg-black px-3 py-1.5 font-sans text-[12px] tracking-[0.05em] text-white transition-opacity hover:opacity-80"
                  >
                    {copied ? 'copied ✓' : 'copy CSS'}
                  </button>
                  <button
                    onClick={() => set({ ...SHIPPED, dots: p.dots })}
                    className="rounded-[8px] border border-black/15 px-3 py-1.5 font-sans text-[12px] tracking-[0.05em] text-black/50 hover:border-black/40"
                  >
                    reset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1208px] px-6 py-10">
        {/* The CSS this exact configuration emits — paste into PrimaryCard's
            var() defaults (or hand it back to Claude) to ship it. */}
        <pre className="mb-10 overflow-x-auto rounded-[15px] border border-[#EBEBEB] bg-[#FAFAF9] px-5 py-4 font-mono text-[11px] leading-[1.7] text-black/70">
          {css}
        </pre>

        {/* Masonry via CSS columns — cards vary in height by their mask aspect. */}
        <div className="[column-gap:24px] columns-2 sm:columns-3 lg:columns-4" style={vars}>
          {SAMPLES.map((b, i) => (
            <div key={i} className="mb-8 break-inside-avoid">
              <div className="mb-1"><BracketLabel>{b.card_type} → {resolveCategory(b.url, b.card_type).category}</BracketLabel></div>
              <PrimaryCard
                url={b.url}
                title={b.title}
                imageUrl={b.image_url}
                screenshotUrl={b.screenshot_url}
                faviconUrl={b.favicon_url}
                cardType={b.card_type}
                listName={b.list}
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
