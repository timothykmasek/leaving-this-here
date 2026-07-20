'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { pickCardImage } from '@/lib/cardImage'
import { formatCardTitle } from '@/lib/cardTitle'

// "Ambient shelf" — a quiet row docked under a list's bullets that surfaces
// OTHER links the owner already saved that fit this list, for one-tap filing.
// Design intent (handoff option 1c): a peripheral offer, not the main event —
// low-contrast, no modal, dismissable by simply ignoring it, and it shrinks
// gracefully as the pile empties (>4 → 2-4 → 1 → 0). The edge-state ladder IS
// the feature; keep it even if the styling drifts.
//
// Fonts/tokens are mapped to our design system, not the prototype's raw CSS:
// prototype Cormorant → `font-serif` (Cardo), IBM Plex Mono → `.label` (Routed
// Gothic Wide). The one imported value is the periwinkle accent — our chrome is
// deliberately neutral, so this is the single spot of color, used sparingly.

const ACCENT = '#6f7fc0'
const ACCENT_BORDER = '#d3d8ee'

export type Suggestion = {
  id: string
  url: string
  title: string | null
  description: string | null
  image_url: string | null
  screenshot_url: string | null
  favicon_url: string | null
  card_type: any
  similarity: number
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

// Shared thumbnail: real OG/screenshot image with a neutral domain-tile
// fallback, matching the card grid above it.
function Thumb({ s, className }: { s: Suggestion; className?: string }) {
  const [err, setErr] = useState(false)
  const image = pickCardImage(s.url, s.image_url, s.screenshot_url, s.card_type)
  const show = !!image && !err
  return (
    <div
      className={`relative overflow-hidden rounded-[5px] bg-black/[0.05] ${className || ''}`}
    >
      {show ? (
        <Image
          src={image as string}
          alt=""
          fill
          sizes="180px"
          className="object-cover"
          onError={() => setErr(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="label text-[8px] text-stone-400">{getDomain(s.url)}</span>
        </div>
      )}
    </div>
  )
}

// One small shelf/grid card (collapsed 172px width, or a grid cell when
// expanded). `+ ADD` fills the accent on hover.
function ShelfCard({
  s,
  onAdd,
  fixedWidth,
}: {
  s: Suggestion
  onAdd: () => void
  fixedWidth?: boolean
}) {
  const title = formatCardTitle({ title: s.title, description: s.description, url: s.url, siteName: null })
  return (
    <div
      className={`relative rounded-[11px] border border-[#eeede9] bg-white p-[11px] ${
        fixedWidth ? 'w-[172px] flex-none' : ''
      }`}
    >
      <Thumb s={s} className="aspect-[16/10] w-full" />
      <div className="mt-[9px] h-[42px] overflow-hidden font-serif text-[12px] font-semibold leading-[1.15] text-ink">
        {title}
      </div>
      <button
        onClick={onAdd}
        className="group mt-2 w-full rounded-[20px] border py-[7px] transition-colors"
        style={{ borderColor: ACCENT_BORDER, color: ACCENT }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = ACCENT
          e.currentTarget.style.color = '#fff'
          e.currentTarget.style.borderColor = ACCENT
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
          e.currentTarget.style.color = ACCENT
          e.currentTarget.style.borderColor = ACCENT_BORDER
        }}
      >
        <span className="label text-[10px]">+ Add</span>
      </button>
    </div>
  )
}

export function SuggestionShelf({
  listId,
  onAdd,
}: {
  listId: string
  // Files a suggestion into the list (parent owns the mutation + grid/count
  // update). Should resolve when persisted; the shelf removes the card
  // optimistically regardless.
  onAdd: (s: Suggestion) => Promise<void> | void
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/lists/${listId}/suggestions`)
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d) => {
        if (!cancelled) setSuggestions(Array.isArray(d.suggestions) ? d.suggestions : [])
      })
      .catch(() => {
        if (!cancelled) setSuggestions([])
      })
    return () => {
      cancelled = true
    }
  }, [listId])

  // Still loading, or the shelf never had anything to offer → render nothing.
  // Ambient means ignorable: we don't flash a skeleton and we don't announce an
  // empty shelf on a list that had zero confident suggestions to begin with.
  if (!suggestions || suggestions.length === 0) return null

  const pending = suggestions.filter((s) => !addedIds.has(s.id))
  const addedCount = addedIds.size

  const handleAdd = async (s: Suggestion) => {
    setAddedIds((prev) => new Set(prev).add(s.id))
    try {
      await onAdd(s)
    } catch {
      // If the write failed, put it back so the user can retry.
      setAddedIds((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
    }
  }

  const AddedLine = () =>
    addedCount > 0 ? (
      <div className="mt-3">
        <span className="label text-[10px]" style={{ color: ACCENT }}>
          ✓ {addedCount} added to this list
        </span>
      </div>
    ) : null

  return (
    <section className="mt-[30px] rounded-[14px] border border-[#edece8] bg-[#faf9f7] p-[18px] pb-5">
      {/* header */}
      <div className="flex items-center justify-between">
        <span className="label text-[10px]" style={{ color: '#9aa6d1', letterSpacing: '0.2em' }}>
          ✦ You might also add
        </span>
        {pending.length > 4 && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="label text-[10px] text-stone-500 hover:text-ink"
          >
            {showAll ? 'Show less ↑' : `See all ${pending.length} →`}
          </button>
        )}
      </div>

      {/* 0 remaining (but we had some) → empty state */}
      {pending.length === 0 && (
        <div className="mt-[14px] rounded-[12px] border border-dashed border-[#e3e1dc] bg-white px-6 py-[26px] text-center">
          <p className="font-serif text-[18px] italic text-ink">Nothing left to suggest.</p>
          <p className="label mt-[6px] text-[10px]" style={{ color: '#9aa6d1' }}>
            You&rsquo;ve added everything that fits this list
          </p>
        </div>
      )}

      {/* exactly 1 remaining → dedicated single-suggestion row */}
      {pending.length === 1 && (() => {
        const s = pending[0]
        const title = formatCardTitle({ title: s.title, description: s.description, url: s.url, siteName: null })
        return (
          <div className="mt-[14px] flex items-center gap-3 rounded-[12px] border border-[#eeede9] bg-white p-[14px] sm:gap-4">
            {/* thumb shrinks on phones so the title keeps room; full size ≥sm */}
            <Thumb s={s} className="aspect-[16/10] w-[92px] flex-none sm:w-[132px]" />
            <div className="min-w-0 flex-1">
              <div className="label text-[10px]" style={{ color: '#bcbab3' }}>
                {getDomain(s.url)} · Last one
              </div>
              <div className="mt-[3px] font-serif text-[16px] font-semibold leading-[1.15] text-ink sm:text-[18px]">
                {title}
              </div>
            </div>
            <button
              onClick={() => handleAdd(s)}
              className="flex-none rounded-[22px] px-[14px] py-[9px] text-white transition-[filter] hover:brightness-110 sm:px-[18px]"
              style={{ background: ACCENT }}
            >
              <span className="label text-[11px] text-white">+ Add</span>
            </button>
          </div>
        )
      })()}

      {/* 2-4 (or >4 collapsed) → horizontal shelf */}
      {pending.length > 1 && !showAll && (
        <div className="flex gap-3 overflow-x-auto px-[2px] pb-[6px] pt-[14px]">
          {pending.map((s) => (
            <ShelfCard key={s.id} s={s} onAdd={() => handleAdd(s)} fixedWidth />
          ))}
        </div>
      )}

      {/* >4 expanded → 4-col grid */}
      {pending.length > 1 && showAll && (
        <div className="mt-[14px] grid max-h-[460px] grid-cols-2 gap-3 overflow-y-auto p-[2px] sm:grid-cols-3 lg:grid-cols-4">
          {pending.map((s) => (
            <ShelfCard key={s.id} s={s} onAdd={() => handleAdd(s)} />
          ))}
        </div>
      )}

      <AddedLine />
    </section>
  )
}
