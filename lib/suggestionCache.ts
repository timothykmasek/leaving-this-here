// Session cache of the "you might also add" shelf (components/SuggestionShelf).
// Lives outside the component so pages that only need to purge it (the profile,
// the list page) don't pull the whole shelf into their bundle.

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
export const BULLET_DELETED = 'bulletin:bullet-deleted'

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
