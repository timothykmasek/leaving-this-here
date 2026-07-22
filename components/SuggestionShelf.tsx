'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
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

  // Per-tab cache so revisiting a list paints the shelf instantly, then a
  // background fetch replaces it with fresh ranking. sessionStorage (not local)
  // keeps staleness bounded to the tab's lifetime.
  const cacheKey = `bulletin:shelf:${listId}`

  // Dismissed ("✕ not for this list") suggestion ids. localStorage — a refusal
  // should outlive the session, unlike the ranking cache above. Per-browser by
  // design: keeps the feature server-free; a cross-device version would need a
  // dismissals table. SSR-guarded — the initializer also runs on the server.
  const dismissedKey = `bulletin:shelf:dismissed:${listId}`
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      return new Set(JSON.parse(localStorage.getItem(dismissedKey) || '[]'))
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    let cancelled = false

    try {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) setSuggestions(JSON.parse(cached))
    } catch {
      // cache is best-effort only
    }

    // Over-fetch (limit 12 vs the 4-up row) so dismissed/added cards have
    // backfill and the shelf doesn't go sparse after a few refusals.
    fetch(`/api/lists/${listId}/suggestions?limit=12`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return
        if (d && Array.isArray(d.suggestions)) {
          setSuggestions(d.suggestions)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(d.suggestions))
          } catch {}
        } else {
          // Fetch failed: keep showing the cache if we had one; otherwise stay
          // hidden. Never blank a shelf the user is already looking at.
          setSuggestions((prev) => prev ?? [])
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions((prev) => prev ?? [])
      })
    return () => {
      cancelled = true
    }
  }, [listId, cacheKey])

  // Still loading, or nothing to offer → render nothing (stays ignorable; no
  // skeleton flash, no "empty" announcement on a list that had zero suggestions).
  if (!suggestions || suggestions.length === 0) return null

  const pending = suggestions.filter(
    (s) => !addedIds.has(s.id) && !dismissedIds.has(s.id)
  )
  const addedCount = addedIds.size
  const visible = showAll ? pending : pending.slice(0, COLLAPSED_MAX)

  // "✕ not for this list" — quiet refusal. No confirmation, no undo UI; the
  // card just leaves. Two persistence layers: localStorage applies instantly on
  // this browser, and a fire-and-forget insert into shelf_dismissals (optional
  // table, migration 013; user_id defaults to auth.uid()) syncs the refusal
  // across devices via the route's server-side filter. If the table doesn't
  // exist the insert fails silently and the local layer still holds.
  const handleDismiss = (s: Suggestion) => {
    setDismissedIds((prev) => {
      const next = new Set(prev).add(s.id)
      try {
        localStorage.setItem(dismissedKey, JSON.stringify([...next]))
      } catch {}
      return next
    })
    createClient()
      .from('shelf_dismissals')
      .insert({ list_id: listId, bookmark_id: s.id })
      .then(() => {}, () => {})
  }

  const handleAdd = async (s: Suggestion) => {
    setAddedIds((prev) => new Set(prev).add(s.id))
    try {
      await onAdd(s)
      // Keep the cache consistent so a reload in this tab doesn't resurrect the
      // card before the background refresh corrects it.
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || '[]')
        sessionStorage.setItem(
          cacheKey,
          JSON.stringify(cached.filter((x: Suggestion) => x.id !== s.id))
        )
      } catch {}
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
            <div key={s.id} className="group relative w-full">
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
              {/* Dismiss — same overlay treatment as the card's edit pencil:
                  hover-revealed where hover exists, always visible on touch.
                  z-[2] sits above the card's stretched link. */}
              <button
                type="button"
                onClick={() => handleDismiss(s)}
                aria-label="dismiss suggestion"
                title="not for this list"
                className="absolute right-3 top-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm backdrop-blur-sm transition-opacity hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
              >
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
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
