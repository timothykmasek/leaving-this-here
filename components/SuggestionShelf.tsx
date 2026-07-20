'use client'

import { useEffect, useState } from 'react'
import { BookmarkCard } from '@/components/BookmarkCard'

// "Ambient shelf" — a quiet panel under a list's bullets that surfaces OTHER
// links the owner already saved that fit this list, for one-tap filing. Design
// intent (handoff option 1c): a peripheral offer, not the main event — it
// renders nothing until it has confident suggestions, so it's fully ignorable.
//
// Visual language is the app's, not the prototype's: each suggestion is a real
// <BookmarkCard> (same 272×270 plate, rivets, Cardo title, inset thumb as the
// bullets above) laid out in the same card grid, with a `+ ADD` action beneath.
// Reusing the card keeps the shelf pixel-identical to the rest of the app and in
// sync with any future card changes.

// How many cards the row shows before "see all" — matches the ~4-up the main
// grid lands on at desktop width.
const COLLAPSED_MAX = 4

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

export function SuggestionShelf({
  listId,
  onAdd,
}: {
  listId: string
  // Files a suggestion into the list (parent owns the mutation + grid/count
  // update). The shelf removes the card optimistically regardless.
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

  // Still loading, or nothing to offer → render nothing (stays ignorable; no
  // skeleton flash, no "empty" announcement on a list that had zero suggestions).
  if (!suggestions || suggestions.length === 0) return null

  const pending = suggestions.filter((s) => !addedIds.has(s.id))
  const addedCount = addedIds.size
  const visible = showAll ? pending : pending.slice(0, COLLAPSED_MAX)

  const handleAdd = async (s: Suggestion) => {
    setAddedIds((prev) => new Set(prev).add(s.id))
    try {
      await onAdd(s)
    } catch {
      setAddedIds((prev) => {
        const next = new Set(prev)
        next.delete(s.id)
        return next
      })
    }
  }

  return (
    <section className="mt-12 border-t border-gray-100 pt-8">
      {/* header — same label font/treatment as the rest of the chrome */}
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <span className="label text-stone-400">You might also add</span>
        {pending.length > COLLAPSED_MAX && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="label text-stone-400 transition-colors hover:text-ink"
          >
            {showAll ? 'Show less' : `See all ${pending.length}`}
          </button>
        )}
      </div>

      {pending.length === 0 ? (
        // 0 remaining (after the owner cleared the shelf).
        <p className="py-8 text-center font-serif text-lg italic text-stone-400">
          Nothing left to suggest.
        </p>
      ) : (
        // Same grid as the bullets above, so the shelf reads as one system.
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6">
          {visible.map((s) => (
            <div key={s.id} className="w-full">
              <BookmarkCard
                id={s.id}
                title={s.title}
                description={s.description}
                url={s.url}
                imageUrl={s.image_url}
                screenshotUrl={s.screenshot_url}
                faviconUrl={s.favicon_url}
                isOwner={false}
                cardType={s.card_type}
              />
              <button
                onClick={() => handleAdd(s)}
                className="label mt-2 w-full rounded-full border border-black/10 py-2 text-ink transition-colors hover:bg-ink hover:text-white"
              >
                + Add
              </button>
            </div>
          ))}
        </div>
      )}

      {addedCount > 0 && (
        <p className="label mt-4 text-stone-400">
          ✓ {addedCount} added to this list
        </p>
      )}
    </section>
  )
}
