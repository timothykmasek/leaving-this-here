'use client'

import { useEffect, useState, useRef } from 'react'
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
/** Fired by forgetSuggestion(); listened for by every mounted shelf. */
const BULLET_DELETED = 'bulletin:bullet-deleted'

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
  // Clearing the cache only decides what a FUTURE shelf fetches. Any shelf
  // already on screen holds its suggestions in React state, and its visible
  // filter asks only "added?" and "dismissed?" — a deleted bullet is neither,
  // so the card sat there until a reload. Tell the live ones too.
  //
  // An event rather than a prop because this is the one function both delete
  // handlers already call (the list page and the profile), so every mounted
  // shelf heals without either of them knowing a shelf exists.
  try {
    window.dispatchEvent(new CustomEvent(BULLET_DELETED, { detail: bookmarkId }))
  } catch {
    // Older browsers without CustomEvent: the cache purge above still stands.
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
  // The ids on screen, in the order they sit. Held explicitly rather than
  // derived by slicing the pool, because Masonry places by INDEX
  // (columns[i % cols]): drop the second of four and the third and fourth each
  // shift a column left while a replacement appears in the fourth — three cards
  // jumping sideways for one click. Acting on a slot now swaps only that slot,
  // and every other card stays exactly where it was.
  const [slotIds, setSlotIds] = useState<string[] | null>(null)
  const sectionRef = useRef<HTMLElement>(null)

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

  // A bullet deleted anywhere on the page leaves this shelf immediately, rather
  // than lingering until the next mount. Filters state instead of refetching:
  // the row is already gone, so asking the server again would only cost a round
  // trip to be told the same thing.
  useEffect(() => {
    const onDeleted = (e: Event) => {
      const id = (e as CustomEvent<string>).detail
      if (!id) return
      setSuggestions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev))
    }
    window.addEventListener(BULLET_DELETED, onDeleted)
    return () => window.removeEventListener(BULLET_DELETED, onDeleted)
  }, [])

  // Still loading, or nothing to offer → render nothing (stays ignorable; no
  // skeleton flash, no "empty" announcement on a list that had zero suggestions).
  if (!suggestions || suggestions.length === 0) return null

  const pending = suggestions.filter(
    (s) => !addedIds.has(s.id) && !dismissedIds.has(s.id)
  )
  // Slots fill themselves the first time, and refill from the pool whenever the
  // fetch brings in more or the reader asks to see everything. Filtered against
  // pending each render so a card removed by some other route (a deleted
  // bullet) can't linger in a slot.
  const wanted = showAll ? pending.length : COLLAPSED_MAX
  const live = (slotIds ?? []).filter((id) => pending.some((s) => s.id === id))
  const filled =
    live.length >= wanted
      ? live.slice(0, wanted)
      : [
          ...live,
          ...pending.filter((s) => !live.includes(s.id)).slice(0, wanted - live.length).map((s) => s.id),
        ]
  const byId = new Map(pending.map((s) => [s.id, s]))
  const visible = filled.map((id) => byId.get(id)!).filter(Boolean)

  // Spent → the whole section goes, border and all. It used to keep its rule
  // and print "Nothing left to suggest" underneath, which is a heading with
  // nothing beneath it announcing its own absence. A shelf with nothing on it
  // is not a state worth drawing.
  if (pending.length === 0) return null

  // Replace one slot in place with the next unused suggestion, so the cards
  // either side of it do not move. Returning the same array when nothing
  // changes keeps React from re-rendering for no reason.
  const swapSlot = (goneId: string) =>
    setSlotIds((prev) => {
      const base = prev ?? filled
      if (!base.includes(goneId)) return prev
      const taken = new Set(base)
      const next = pending.find((s) => s.id !== goneId && !taken.has(s.id))
      return base.map((id) => (id === goneId ? next?.id : id)).filter(Boolean) as string[]
    })

  // "✕ not for this list" — quiet refusal. No confirmation, no undo UI; the
  // card just leaves. Two persistence layers: localStorage applies instantly on
  // this browser, and a fire-and-forget insert into shelf_dismissals (optional
  // table, migration 013; user_id defaults to auth.uid()) syncs the refusal
  // across devices via the route's server-side filter. If the table doesn't
  // exist the insert fails silently and the local layer still holds.
  const handleDismiss = (s: Suggestion) => {
    swapSlot(s.id)
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
    // Where the shelf sits in the viewport, right now. Adding a bullet grows
    // the grid ABOVE this shelf by a card, and the browser holds scrollY — so
    // the shelf slides down the screen and the reader is left looking at
    // whatever used to be above it. Nothing scrolled; the page grew under the
    // scroll position. Native scroll anchoring should cover this and doesn't:
    // the masonry re-distributes every child on each render, so the anchor it
    // picked is gone by the time it looks again.
    const topBefore = sectionRef.current?.getBoundingClientRect().top ?? null

    // Remember where it sat, so a failed add can put it back in its own slot
    // rather than at the end — or nowhere, which is what would happen if the
    // revert only undid addedIds.
    const slot = filled.indexOf(s.id)
    swapSlot(s.id)
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
      setSlotIds((prev) => {
        if (!prev || slot < 0) return prev
        const restored = prev.filter((id) => id !== s.id)
        restored.splice(slot, 0, s.id)
        return restored
      })
    }

    // Put the shelf back where it was. Two frames because the first only
    // guarantees React committed; the layout it caused is measurable on the
    // next one. Corrects on success AND failure — the grid may have grown
    // either way, and a shelf that jumps only sometimes is worse than one that
    // always does.
    if (topBefore !== null) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const topAfter = sectionRef.current?.getBoundingClientRect().top
          if (topAfter === undefined) return
          const drift = topAfter - topBefore
          // Sub-pixel drift is not worth a scroll call.
          if (Math.abs(drift) > 1) window.scrollBy(0, drift)
        })
      )
    }
  }

  return (
    <section ref={sectionRef} className="mt-12 border-t border-black/[0.06] pt-8">
      <div className="mb-6 flex items-baseline justify-between gap-4">
        <span className="label text-black/30">You might also add</span>
        {pending.length > COLLAPSED_MAX && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="label text-black/30 transition-colors hover:text-ink"
          >
            {showAll ? 'Show less' : `See all ${pending.length}`}
          </button>
        )}
      </div>

      {/* Same masonry as the bullets above, so the shelf reads as one system. */}
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
    </section>
  )
}
