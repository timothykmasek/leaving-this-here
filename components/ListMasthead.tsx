'use client'

// The masthead for a list page, per the ProjectX list frame: the back link
// leading, then the list's name as a full-width editorial display — Cardo at
// poster scale, one line, running off the right edge into white when it's long
// — over a quiet meta row (bullet count, and the owner's delete link on
// hover). The attribution ("A list by Tim Masek") lives in the header's
// centred tagline slot, descriptions dropped from display entirely, and the
// cover band is retired — the name IS the identity now.
//
// Owner editing is the title itself: click the poster name, type, enter or
// blur saves, escape cancels. The old edit panel (name input + description
// textarea + save row) is gone — with descriptions off the page it had one
// job left, and the title does that job in place. Legacy props (description,
// cover, strip) are still accepted so older call sites compile, but nothing
// renders them.
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
  isPrivate = false,
  onRename,
  onDelete,
  // Retired — accepted so call sites compile.
  description: _description,
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
  isPrivate?: boolean
  /** Persist a rename. Present → the poster title edits in place on click. */
  onRename?: (name: string) => void
  /** Delete the list. Present → a quiet confirm-guarded link in the meta row. */
  onDelete?: () => void
  description?: string | null
  ownerName?: string
  coverUrl?: string | null
  stripThumbs?: string[]
  coverControl?: ReactNode
  editControl?: ReactNode
}) {
  // The right-edge fade only earns its place when the name actually runs past
  // the container — a short name ends in air, not in a dissolve.
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [name])

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const saveTitle = () => {
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
      <div className="relative mt-6 overflow-hidden sm:mt-12">
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') setEditing(false)
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
                    setDraft(name)
                    setEditing(true)
                  }
                : undefined
            }
            title={onRename ? 'Click to rename' : undefined}
            className={`${titleClass} ${onRename ? 'cursor-text' : ''}`}
          >
            {name}
          </h1>
        )}
        {overflowing && !editing && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-[100px] bg-gradient-to-r from-white/0 to-white sm:w-[220px]"
          />
        )}
      </div>

      {/* Meta row: count left, and on the right — the slot the count used to
          hold — the owner's delete, dressed exactly like the count (same 12px,
          same 56% black), underlining only under the pointer. Confirm-guarded
          inline, same pattern as the bullet modal. */}
      <div className="mt-10 flex items-center justify-between gap-4 pb-8 font-sans text-[12px] font-medium leading-4 tracking-[0.05em] sm:mt-24">
        <span className="text-black/[0.56]">
          {count} {count === 1 ? 'Bullet' : 'Bullets'}
          {isPrivate && ' · Private'}
        </span>
        {onDelete &&
          (confirmingDelete ? (
            <span className="flex items-center gap-2.5">
              <span className="text-black/45">Delete this list?</span>
              <button
                onClick={onDelete}
                className="text-[#a31f34] underline underline-offset-2 transition-opacity hover:opacity-60"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-black/45 transition-opacity hover:opacity-60"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-black/[0.56] hover:underline hover:underline-offset-2"
            >
              Delete list
            </button>
          ))}
      </div>
    </header>
  )
}
