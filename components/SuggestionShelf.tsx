'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'

// "Ambient shelf" — a quiet panel under a list's bullets that surfaces OTHER
// links the owner already saved that fit this list, for one-tap filing. Design
// intent (handoff option 1c): a peripheral offer, not the main event — it
// renders nothing until it has confident suggestions, so it's fully ignorable.
//
// Each suggestion is a real <PrimaryCard> in the same masonry as the bullets
// above, with a `+ ADD` action beneath. Reusing the card keeps the shelf in sync
// with any card changes.

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
  image_pref: string | null
  note: string | null
  created_at: string | null
  similarity: number
}

/**
 * Drop a bookmark from every cached shelf, everywhere.
 *
 * The shelf paints its sessionStorage cache first and swaps in a fresh fetch
 * after, so a DELETED bullet kept being offered — the delete handlers emptied
 * the grid but never touched this cache. It self-corrected once the fetch
 * landed, and not at all if that fetch failed.
 *
 * Worse than a stale card: list_bookmarks.bookmark_id is a foreign key, so
 * pressing "+ Add" on a suggestion whose row is gone throws rather than
 * quietly doing nothing.
 *
 * Scans every `bulletin:shelf:*` key because a bookmark can sit in the cache of
 * any number of lists and the caller has no idea which — the add path could
 * clean just its own list's entry, a delete can't.
 */
export function forgetSuggestion(bookmarkId: string) {
  if (typeof window === 'undefined') return
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)
      if (!key || !key.startsWith('bulletin:shelf:')) continue
      // Skip the dismissal lists — different shape, different lifetime.
      if (key.startsWith('bulletin:shelf:dismissed:')) continue
      const raw = sessionStorage.getItem(key)
      if (!raw) continue
      const list = JSON.parse(raw)
      if (!Array.isArray(list)) continue
      const next = list.filter((s: any) => s?.id !== bookmarkId)
      if (next.length !== list.length) sessionStorage.setItem(key, JSON.stringify(next))
    }
  } catch {
    // Cache hygiene is best-effort; the background fetch is the real backstop.
  }
}

export function SuggestionShelf({
  listId,
  onAdd,
  onOpen,
}: {
  listId: string
  /** Open a suggestion in the bullet detail modal — the same hover pencil every
   *  other card has. Hands up the whole suggestion, not just an id: it isn't in
   *  the page's members map, so the parent has to register it before showing it. */
  onOpen?: (s: Suggestion) => void
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
    <section className="mt-12 border-t border-black/[0.06] pt-8">
      {/* When the shelf is spent the header IS the message — one label line
          rather than a heading followed by a second line saying there's
          nothing under it. */}
      <div className={`flex items-baseline justify-between gap-4 ${pending.length === 0 ? '' : 'mb-6'}`}>
        <span className="label text-black/30">
          {pending.length === 0 ? 'Nothing left to suggest' : 'You might also add'}
        </span>
        {pending.length > COLLAPSED_MAX && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="label text-black/30 transition-colors hover:text-ink"
          >
            {showAll ? 'Show less' : `See all ${pending.length}`}
          </button>
        )}
      </div>

      {pending.length > 0 && (
        // Same masonry as the bullets above, so the shelf reads as one system.
        <Masonry>
          {visible.map((s) => (
            <div key={s.id} className="group relative">
              <PrimaryCard
                id={s.id}
                onOpen={onOpen && (() => onOpen(s))}
                url={s.url}
                title={s.title}
                description={s.description}
                imageUrl={s.image_url}
                screenshotUrl={s.screenshot_url}
                faviconUrl={s.favicon_url}
                cardType={s.card_type}
                imagePref={s.image_pref}
              />
              {/* Add and dismiss are the two answers to the same question, so
                  they sit together under the card as one row. The dismiss used
                  to be a hover-revealed chip floating over the card's top-right
                  corner while Add was a full-width bar underneath — two controls
                  for one decision, in two places, with two different visibility
                  rules. Both are always visible now: on a shelf whose entire
                  purpose is "add or don't", hiding half the choice until hover
                  wasn't buying any calm.

                  items-stretch so the dismiss matches Add's height exactly
                  rather than being separately tuned to it. */}
              <div className="mt-2 flex items-stretch gap-2">
                <button
                  onClick={() => handleAdd(s)}
                  className="label flex-1 rounded-full border border-black/10 py-2 text-ink transition-colors hover:bg-ink hover:text-white"
                >
                  + Add
                </button>
                <button
                  type="button"
                  onClick={() => handleDismiss(s)}
                  aria-label="dismiss suggestion"
                  title="not for this list"
                  className="flex shrink-0 items-center justify-center rounded-full border border-black/10 px-3 text-black/40 transition-colors hover:border-black/30 hover:text-ink"
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
              </div>
            </div>
          ))}
        </Masonry>
      )}

      {addedCount > 0 && pending.length > 0 && (
        <p className="label mt-4 text-black/30">
          {addedCount} added to this list
        </p>
      )}
    </section>
  )
}
