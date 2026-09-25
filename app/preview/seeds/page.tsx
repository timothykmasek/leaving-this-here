'use client'

import { useEffect, useMemo, useState } from 'react'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import {
  SEED_LIBRARY,
  INTERESTS,
  INTEREST_LABEL,
  pickPool,
  seedImageUrl,
  type Interest,
  type SeedLink,
} from '@/lib/seedLibrary'

// Review board for the onboarding pick-3 library (lib/seedLibrary.ts).
//   • By interest — every seed tagged with one interest, in library order.
//   • Simulate    — choose 2–3 interests exactly like /start and see the grid
//                   in the order the picker deals it (the shared pickPool).
// Cards are the live PrimaryCard with the baked seed image, so a blank card
// here is a blank card in onboarding. Not linked anywhere.
//
// Select mode (dev only) bulk-deletes seeds: click cards, shift-click for a
// range, then delete. That rewrites lib/seedLibrary.ts through
// /api/onboarding/seeds/remove; undo with `git checkout lib/seedLibrary.ts`.

type Mode = 'interest' | 'simulate'
type ImgState = 'ok' | 'missing'

export default function SeedsPreview() {
  const [mode, setMode] = useState<Mode>('interest')
  const [tab, setTab] = useState<Interest | 'all'>('style')
  const [sim, setSim] = useState<Interest[]>(['style', 'design'])
  const [img, setImg] = useState<Record<string, ImgState>>({})
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [anchor, setAnchor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  // Probe every baked image once so missing bakes are flagged, not guessed.
  useEffect(() => {
    for (const L of SEED_LIBRARY) {
      const probe = new Image()
      probe.onload = () => setImg((m) => ({ ...m, [L.url]: probe.naturalWidth > 1 ? 'ok' : 'missing' }))
      probe.onerror = () => setImg((m) => ({ ...m, [L.url]: 'missing' }))
      probe.src = seedImageUrl(L)
    }
  }, [])

  const shown: SeedLink[] = useMemo(() => {
    if (mode === 'simulate') return pickPool(sim)
    return tab === 'all' ? SEED_LIBRARY : SEED_LIBRARY.filter((L) => L.interest === tab)
  }, [mode, tab, sim])

  // Not memoised: after a delete the module hot-reloads and these must recount.
  const counts = Object.fromEntries(
    INTERESTS.map((i) => [i.key, SEED_LIBRARY.filter((L) => L.interest === i.key).length]),
  ) as Record<Interest, number>
  const missing = SEED_LIBRARY.filter((L) => img[L.url] === 'missing').length
  const shownMissing = shown.filter((L) => img[L.url] === 'missing').length

  // Click toggles one card; shift-click selects everything between it and the
  // last card clicked, in the order shown.
  const select = (url: string, shift: boolean) => {
    if (shift && anchor) {
      const a = shown.findIndex((L) => L.url === anchor)
      const b = shown.findIndex((L) => L.url === url)
      if (a >= 0 && b >= 0) {
        const range = shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((L) => L.url)
        setSelected((s) => [...new Set([...s, ...range])])
        setAnchor(url)
        return
      }
    }
    setSelected((s) => (s.includes(url) ? s.filter((u) => u !== url) : [...s, url]))
    setAnchor(url)
  }

  const remove = async () => {
    const titles = SEED_LIBRARY.filter((L) => selected.includes(L.url)).map((L) => `• ${L.title}`)
    if (!confirm(`Delete ${selected.length} seed${selected.length === 1 ? '' : 's'} from lib/seedLibrary.ts?\n\n${titles.join('\n')}`)) return
    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/seeds/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: selected }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
      setNote(`Deleted ${json.removed}. Undo with git checkout lib/seedLibrary.ts`)
      setSelected([])
      setAnchor(null)
    } catch (e) {
      setNote(`Delete failed: ${e instanceof Error ? e.message : e}`)
    } finally {
      setBusy(false)
    }
  }

  const toggleSim = (k: Interest) =>
    setSim((s) => (s.includes(k) ? s.filter((x) => x !== k) : s.length < 3 ? [...s, k] : s))

  const because = sim.map((i) => INTEREST_LABEL[i])
  const becauseLine =
    because.length <= 1 ? because[0] ?? '' : because.length === 2 ? `${because[0]} and ${because[1]}` : `${because.slice(0, -1).join(', ')}, and ${because.at(-1)}`

  return (
    <main className="min-h-screen bg-paper px-4 pb-24 pt-10 sm:px-8">
      <header className="mx-auto mb-8 max-w-6xl">
        <p className="text-xs uppercase tracking-[0.14em] text-black/40">Preview · onboarding</p>
        <h1 className="mt-1 font-serif text-3xl font-bold text-ink">Pick-3 seed library</h1>
        <p className="mt-2 text-sm text-black/55">
          {SEED_LIBRARY.length} links across {INTERESTS.length} interests.{' '}
          {Object.keys(img).length < SEED_LIBRARY.length
            ? 'Checking images…'
            : missing
              ? `${missing} have no baked image.`
              : 'Every link has a baked image.'}
        </p>

        <div className="mt-6 inline-flex rounded-full bg-black/[0.05] p-1 text-sm">
          {(['interest', 'simulate'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-1.5 ${mode === m ? 'bg-white font-semibold text-ink shadow-sm' : 'text-black/55'}`}
            >
              {m === 'interest' ? 'By interest' : 'Simulate a signup'}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setSelecting((v) => !v)
            setSelected([])
            setAnchor(null)
          }}
          className={`ml-3 rounded-full border px-4 py-1.5 text-sm ${selecting ? 'border-red-600 bg-red-600 text-white' : 'border-black/15 bg-white text-ink'}`}
        >
          {selecting ? 'Done selecting' : 'Select to delete'}
        </button>
        {note && <p className="mt-3 text-sm text-black/60">{note}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {mode === 'interest' && (
            <Chip active={tab === 'all'} onClick={() => setTab('all')}>
              All <Count n={SEED_LIBRARY.length} />
            </Chip>
          )}
          {INTERESTS.map(({ key, label }) => {
            const active = mode === 'interest' ? tab === key : sim.includes(key)
            const full = mode === 'simulate' && !active && sim.length >= 3
            return (
              <Chip
                key={key}
                active={active}
                disabled={full}
                onClick={() => (mode === 'interest' ? setTab(key) : toggleSim(key))}
              >
                {label} <Count n={counts[key]} />
              </Chip>
            )
          })}
        </div>

        <p className="mt-4 text-sm text-black/55">
          {mode === 'simulate' ? (
            sim.length < 2 ? (
              <>Pick at least 2, like /start requires.</>
            ) : (
              <>
                “Because you like <span className="text-ink">{becauseLine}</span>.” {shown.length} cards, in picker order
                (one from each interest in turn).
              </>
            )
          ) : (
            <>{shown.length} cards{tab !== 'all' ? `, tagged ${INTEREST_LABEL[tab]}` : ''}, in library order.</>
          )}
          {shownMissing > 0 && <> {shownMissing} without an image here.</>}
        </p>
      </header>

      <div className="mx-auto max-w-6xl">
        <Masonry>
          {shown.map((L, i) => (
            <div key={L.url}>
              <PrimaryCard
                id={L.url}
                url={L.url}
                title={L.title}
                imageUrl={null}
                screenshotUrl={seedImageUrl(L)}
                selecting={selecting}
                selected={selected.includes(L.url)}
                onSelect={select}
              />
              <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 text-[11px] text-black/50">
                <span className="tabular-nums text-black/30">#{i + 1}</span>
                <span className="rounded bg-black/[0.06] px-1.5 py-0.5 text-black/60">{L.type}</span>
                <span className="rounded bg-black/[0.04] px-1.5 py-0.5">{INTEREST_LABEL[L.interest]}</span>
                {img[L.url] === 'missing' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700">no image</span>}
                <span className="ml-auto truncate">{L.domain}</span>
              </div>
            </div>
          ))}
        </Masonry>
      </div>

      {selecting && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-4 bg-gradient-to-t from-paper via-paper/90 to-transparent p-5">
          <span className="text-sm text-black/55">
            <b className="font-semibold text-ink">{selected.length}</b> selected · shift-click for a range
          </span>
          <button
            onClick={() => setSelected(shown.map((L) => L.url))}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm text-ink"
          >
            Select all shown
          </button>
          <button
            onClick={() => setSelected([])}
            disabled={!selected.length}
            className="rounded-full border border-black/15 bg-white px-4 py-2 text-sm text-ink disabled:opacity-40"
          >
            Clear
          </button>
          <button
            onClick={remove}
            disabled={!selected.length || busy}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Deleting…' : `Delete ${selected.length || ''}`.trim()}
          </button>
        </div>
      )}
    </main>
  )
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-35 ${
        active ? 'border-ink bg-ink text-white' : 'border-black/15 bg-white text-ink hover:border-black/40'
      }`}
    >
      {children}
    </button>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 tabular-nums opacity-50">{n}</span>
}
