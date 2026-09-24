'use client'

import { useEffect, useRef, useState } from 'react'
import { FOOTER_CLEARANCE, FROST_STYLE, ListPanel, PILL_LABEL, ROW_TEXT } from '@/components/ImportFab'

// The bulk-select action bar. Takes the dock's place at the foot of the
// profile while selecting (the + tile hides), and wears the dock's own
// materials — the frosted 60px pill, Cardo labels, the same list picker — so
// it reads as the dock changing mode, not a second toolbar arriving.
//
// "Add to list" (Tim, 2026-09-24). The button works like the dock's
// PublishPill: first click shows the lists, the second (with lists picked)
// does the deed and says exactly what it will do. Ranges come from
// shift-click; there's no Select all.
//
// Delete has no confirm step. The cards leave at once and the bar offers Undo
// for a few seconds; the owner commits the delete when that window closes.

export type BarMessage = { text: string; undo?: () => void } | null

export function SelectionBar({
  count,
  onDone,
  onDelete,
  onPublish,
  lists,
  onCreateList,
  message,
}: {
  count: number
  onDone: () => void
  onDelete: () => void
  onPublish: (listIds: string[]) => Promise<void>
  lists: { id: string; name: string }[]
  onCreateList: (name: string) => Promise<string | null>
  message: BarMessage
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // Esc closes the picker first, then leaves select mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (pickerOpen) setPickerOpen(false)
      else onDone()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pickerOpen, onDone])

  // Clicking back into the grid folds the picker, like the dock.
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [pickerOpen])

  // Nothing selected → nothing to publish; fold the picker.
  useEffect(() => {
    if (count === 0) setPickerOpen(false)
  }, [count])

  const togglePicked = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const publish = async () => {
    if (busy || picked.size === 0) return
    setBusy(true)
    try {
      await onPublish([...picked])
      setPickerOpen(false)
      setPicked(new Set())
    } finally {
      setBusy(false)
    }
  }

  const armed = pickerOpen && picked.size > 0
  const publishLabel = busy
    ? 'Adding…'
    : armed
      ? `Add to ${picked.size} list${picked.size === 1 ? '' : 's'} →`
      : pickerOpen
        ? 'Pick a list'
        : 'Add to list'
  // Phones get the short form — the bar has ~340px for everything.
  const publishShort = busy ? 'Adding…' : armed ? 'Add →' : pickerOpen ? 'Pick a list' : 'Add to list'
  const none = count === 0
  const quiet = `${ROW_TEXT} text-black/45 transition-colors hover:text-ink`

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
      style={{ bottom: FOOTER_CLEARANCE }}
    >
      <div ref={rootRef} className="pointer-events-auto relative w-full sm:w-auto">
        {pickerOpen && !message && (
          <div className="absolute bottom-full right-0 mb-2 w-full overflow-hidden rounded-[10px] border-y border-[#E0E0E0] bg-white shadow-[0_12px_36px_-12px_rgba(35,30,20,0.35)] sm:w-[320px]">
            <p className={`${ROW_TEXT} border-x border-[#E0E0E0] px-5 pb-1 pt-4 text-black/40`}>
              Add {count} bullet{count === 1 ? '' : 's'} to
            </p>
            <ListPanel lists={lists} selected={picked} onToggle={togglePicked} onCreate={onCreateList} />
          </div>
        )}

        <div
          className="flex h-[60px] items-center gap-2.5 rounded-[10px] pl-3 pr-2 sm:gap-5 sm:pl-5"
          style={FROST_STYLE}
        >
          {message ? (
            <div className="flex w-full items-center justify-between gap-6 pr-3 sm:min-w-[320px]">
              <span className={PILL_LABEL}>{message.text}</span>
              {message.undo && (
                <button onClick={message.undo} className={`${ROW_TEXT} text-ink underline underline-offset-4`}>
                  Undo
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Phones: the way out lives here, since the top field scrolls away. */}
              <button onClick={onDone} aria-label="Stop selecting" className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center text-black/50 hover:text-ink sm:hidden">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <span className={`${PILL_LABEL} min-w-0 truncate whitespace-nowrap`}>
                {none ? (
                  <>
                    <span className="sm:hidden">Select</span>
                    <span className="hidden sm:inline">Select bullets</span>
                  </>
                ) : (
                  `${count} selected`
                )}
              </span>
              <span aria-hidden className="hidden h-5 w-px bg-black/10 sm:block" />
              <span className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  onClick={onDelete}
                  disabled={none}
                  aria-label="Delete selected"
                  className={`flex h-11 items-center gap-2 rounded-[8px] px-3 text-black/60 transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30 sm:px-4`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                  </svg>
                  <span className={`${ROW_TEXT} hidden sm:inline`}>Delete</span>
                </button>
                <button onClick={onDone} className={`${quiet} hidden px-3 sm:block`}>
                  Cancel
                </button>
                <button
                  onClick={armed ? publish : () => setPickerOpen((o) => !o)}
                  disabled={none || busy}
                  className="h-11 whitespace-nowrap rounded-[8px] bg-ink px-3.5 font-serif sm:px-4 text-[14px] leading-[18px] tracking-[-0.02em] text-white transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-30"
                >
                  <span className="sm:hidden">{publishShort}</span>
                  <span className="hidden sm:inline">{publishLabel}</span>
                </button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
