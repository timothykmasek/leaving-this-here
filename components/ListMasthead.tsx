'use client'

// The masthead for a list page, per the ProjectX list frame: the back link
// leading, then the list's name as a full-width editorial display — Cardo at
// poster scale, one line, running off the right edge into white when it's long
// — over a quiet meta row (bullet count, and the owner's ⋯ menu: make
// private / public, delete). The attribution ("A list by Tim Masek") lives in the header's
// centred tagline slot, descriptions dropped from display entirely, and the
// cover band is retired — the name IS the identity now.
//
// Owner editing is the title itself: click the poster name, type, enter or
// blur saves, escape cancels. The old edit panel (name input + description
// textarea + save row) is gone — with descriptions off the page it had one
// job left, and the title does that job in place. Legacy props (cover,
// strip) are still accepted so older call sites compile, but nothing renders
// them. Descriptions are gone from the data too (migration 030).
//
// Type:
//   • name  → Cardo 400, clamp(52px→180px at 13.5vw), 1.22 leading, -3%
//             tracking (eased off the frame's -0.07em, see titleClass), black/70.
//   • meta  → Mier 500 12/16 +0.05em black/56 — the card metadata voice; the
//             back link keeps its existing BracketLabel dress.

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BracketLabel } from '@/components/BulletinHeader'

// -0.03em, eased off in two steps from the frame's -0.07em: first to -0.05
// because at poster size Cardo's rounds were colliding (the frame's own
// "Startups" shows the r/t touching), then to -0.03 on Tim's call (2026-09-01)
// — the title wanted a bit more air.
const titleClass =
  'whitespace-nowrap font-serif font-normal leading-[1.22] tracking-[-0.03em] text-black/70 text-[clamp(52px,13.5vw,180px)]'

export function ListMasthead({
  name,
  count,
  backHref,
  backLabel,
  onRename,
  onDelete,
  isPrivate = false,
  onSetPrivate,
  // Retired — accepted so call sites compile.
  ownerName: _ownerName,
  coverUrl: _coverUrl,
  stripThumbs: _stripThumbs,
  coverControl: _coverControl,
  editControl: _editControl,
}: {
  name: string
  count: number
  backHref: string
  backLabel: string
  /** Persist a rename. Present → the poster title edits in place on click. */
  onRename?: (name: string) => void
  /** Delete the list. Present → an item in the owner's ⋯ menu, confirm-guarded. */
  onDelete?: () => void
  /** Private lists (migration 033). Only the owner ever sees one. */
  isPrivate?: boolean
  /** Flip visibility. Present → Make private / Make public in the ⋯ menu. */
  onSetPrivate?: (next: boolean) => void
  ownerName?: string
  coverUrl?: string | null
  stripThumbs?: string[]
  coverControl?: ReactNode
  editControl?: ReactNode
}) {
  // Long names auto-scroll: when the name runs past the container the title
  // becomes a slow seamless loop (the doubled-track marquee the list cards'
  // strips already use), with edge fades so letters dissolve rather than get
  // guillotined. A short name stays put and ends in air, not a dissolve.
  //
  // Overflow is measured against the SINGLE copy's width (copyRef), never the
  // doubled track — measuring the track would keep reporting overflow after a
  // resize makes the name fit, wedging the marquee on.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const copyRef = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  // Seconds per loop, set inline so every name travels at the same px/s.
  const [loopSeconds, setLoopSeconds] = useState(20)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => {
      const textWidth = copyRef.current?.offsetWidth ?? el.scrollWidth
      setOverflowing(textWidth > el.clientWidth + 1)
      // One loop travels one copy + the 0.6em gap; ~90px/s reads as a drift.
      setLoopSeconds(Math.max(8, Math.round((textWidth * 1.05) / 90)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  // The owner's ⋯ menu, and which of its actions (if any) is awaiting a yes.
  // Going private and deleting both confirm inline in the meta row; going
  // public doesn't — private is meant to take a step, public never is.
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState<'delete' | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const hasMenu = !!(onDelete || onSetPrivate)

  // Enter saves and unmounts the input, and the unmount can fire onBlur,
  // which would save a second time. One save per edit.
  const saved = useRef(false)
  const saveTitle = () => {
    if (saved.current) return
    saved.current = true
    setEditing(false)
    const clean = draft.trim()
    if (!clean || clean === name || !onRename) return
    onRename(clean)
  }

  return (
    <header className="group pt-2">
      {/* Back link leads the masthead — you know where you are before the
          title announces what it is. Current BracketLabel dress unchanged. */}
      <Link
        href={backHref}
        className="inline-flex text-black/30 transition-colors hover:text-ink"
      >
        <BracketLabel>{backLabel}</BracketLabel>
      </Link>

      {/* Display title. One line always — length is handled by the fade, not
          by wrapping, so the masthead's height never moves. The frame gives it
          ~90px of air above and again below — the spaciousness IS the
          composition. For the owner it's also the rename control. */}
      {/* overflow-x only: the marquee needs horizontal clipping, but Cardo's
          descenders (g, y, p) reach below the line box at poster scale and a
          full overflow-hidden guillotines them. */}
      <div className="relative mt-6 overflow-x-clip sm:mt-12">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              // Escape cancels — and marks the edit done, so the blur that
              // follows the unmount can't save the draft anyway.
              if (e.key === 'Escape') {
                saved.current = true
                setEditing(false)
              }
            }}
            autoFocus
            aria-label="List name"
            // The native caret scales with the font — at poster size it's a
            // 200px black wall. Ghosted to a quarter black it reads as an
            // insertion point again.
            className={`${titleClass} w-full bg-transparent caret-black/25 focus:outline-none`}
          />
        ) : (
          <h1
            ref={titleRef}
            onClick={
              onRename
                ? () => {
                    saved.current = false
                    setDraft(name)
                    setEditing(true)
                  }
                : undefined
            }
            title={onRename ? 'Click to rename' : undefined}
            className={`${titleClass} ${onRename ? 'cursor-text' : ''}`}
          >
            {/* Doubled track (-50% translate = one seamless loop). The gap
                lives on the copies (pr) so the loop point carries the same
                air as the join. Hover pauses (see .title-marquee), which is
                also when click-to-rename happens. */}
            <span
              className={overflowing ? 'title-marquee flex w-max' : undefined}
              style={overflowing ? { animationDuration: `${loopSeconds}s` } : undefined}
            >
              <span ref={copyRef} className={overflowing ? 'shrink-0 pr-[0.6em]' : undefined}>
                {name}
              </span>
              {overflowing && (
                <span aria-hidden className="shrink-0 pr-[0.6em]">
                  {name}
                </span>
              )}
            </span>
          </h1>
        )}
        {overflowing && !editing && (
          <>
            {/* Both edges fade while the name loops — letters leave through
                the left now, not just the right. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 w-[40px] bg-gradient-to-l from-white/0 to-white sm:w-[90px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 w-[100px] bg-gradient-to-r from-white/0 to-white sm:w-[220px]"
            />
          </>
        )}
      </div>

      {/* Meta row: count left (plus a lock when the list is private), and on
          the right the owner's ⋯ menu, dressed in the same 12px 56% black.
          Confirms happen inline in the menu's slot, same pattern as the
          bullet modal. */}
      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 pb-8 font-sans text-[12px] font-medium leading-4 tracking-[0.05em] sm:mt-24">
        <span className="flex items-center gap-3 whitespace-nowrap text-black/[0.56]">
          <span>
            {count} {count === 1 ? 'Bullet' : 'Bullets'}
          </span>
          {isPrivate && (
            // The lock alone, no word (Tim, 2026-09-28). The label stays for
            // screen readers and as the hover title.
            <span className="flex items-center" title="Private: only you can see this list">
              <LockGlyph />
              <span className="sr-only">Private</span>
            </span>
          )}
        </span>
        {hasMenu &&
          (confirming ? (
            // Confirms are just the two words, in the count's grey (Tim,
            // 2026-09-28): the action you picked, then Cancel. Filing is
            // publishing (028), so a delete unpublishes bullets that lived
            // only here; they survive, unfiled.
            <span className="flex items-center gap-4">
              <TextAction
                onClick={() => {
                  setConfirming(null)
                  onDelete?.()
                }}
              >
                Delete
              </TextAction>
              <TextAction onClick={() => setConfirming(null)}>Cancel</TextAction>
            </span>
          ) : (
            // ⋯ opens the options INLINE, to its left, as plain text in the
            // count's grey (Tim, 2026-09-28): no dropdown, no pills.
            <div ref={menuRef} className="flex items-center gap-4">
              {menuOpen && (
                <>
                  {onSetPrivate && (
                    <TextAction
                      onClick={() => {
                        setMenuOpen(false)
                        // One click both ways (Tim, 2026-10-01): the old
                        // confirm repeated the same words, so the first click
                        // looked like it had saved. It's reversible anyway.
                        onSetPrivate(!isPrivate)
                      }}
                    >
                      {isPrivate ? 'Make public' : 'Make private'}
                    </TextAction>
                  )}
                  {onDelete && (
                    <TextAction
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirming('delete')
                      }}
                    >
                      Delete list
                    </TextAction>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-label="List options"
                // 32px hit target around three 3px dots; the dots are the
                // brand's registration-mark motif laid on its side.
                className="-mr-2 flex h-8 w-8 items-center justify-center gap-[3px] rounded-lg text-black/[0.56] transition-colors hover:bg-black/[0.04] hover:text-black/80"
              >
                {[0, 1, 2].map((i) => (
                  <span key={i} className="block h-[3px] w-[3px] rounded-full bg-current" />
                ))}
              </button>
            </div>
          ))}
      </div>
    </header>
  )
}

// The meta row's action voice: same 12px, same 56% black as "27 Bullets",
// underlining only under the pointer. The old "Delete list" link's dress.
function TextAction({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap text-black/[0.56] hover:underline hover:underline-offset-2"
    >
      {children}
    </button>
  )
}

function LockGlyph() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      // Box-centring puts the lock ~1.3px low: Mier's caps and figures
      // centre at 6.7px in the 16px line, not 8. Nudged onto the figures.
      className="h-[12px] w-[12px] -translate-y-[1.3px]"
    >
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
