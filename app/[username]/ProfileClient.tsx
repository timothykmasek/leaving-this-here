'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatTimestampLabel } from '@/lib/timestampLabel'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { CopyTagline } from '@/components/CopyTagline'
import { BulletinHeader } from '@/components/BulletinHeader'
import { CollectionCard } from '@/components/CollectionCard'
import { ProfileIdentity, LINK_ICONS } from '@/components/ProfileIdentity'
import { coerceUrl, detectPlatform, linkLabel, normalizeProfileLinks } from '@/lib/profileLinks'
import { BulletDetail } from '@/components/BulletDetail'
import { SaveHelp } from '@/components/SaveHelp'
import { WelcomeBanner } from '@/components/WelcomeBanner'
import { PreviewBanner } from '@/components/PreviewBanner'
import { ImportFab } from '@/components/ImportFab'
import { LoadMoreSentinel, RENDER_PAGE } from '@/components/LoadMoreSentinel'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'
import { SiteFooter } from '@/components/SiteFooter'
import { useRevealFooter } from '@/lib/useRevealFooter'
import { useMinSm } from '@/lib/useMinSm'
import { uniqueSlug } from '@/lib/slug'
import { forgetSuggestion } from '@/components/SuggestionShelf'
import { SelectionBar, type BarMessage } from '@/components/SelectionBar'
import { createReadOnlyClient } from '@/lib/supabase/readOnlyClient'

// Hybrid: the server component ([username]/page.tsx) fetches profile + bullets +
// lists and passes them in as props, so this island hydrates with content already
// present in the server HTML — no client-side data waterfall, no blank "loading…".
// Same trimmed column set the server renders with — kept in sync so the
// background full-load doesn't reshape rows.
// The profile grid: fluid, with the page margin EQUAL to the column gutter (40),
// so the rhythm runs edge-to-edge instead of a fixed slab centred in dead space.
// At 1530 this gives 4 x 332.5 columns — the design's proportions. Capped at
// 1720 so cards stop growing past ~380 on very wide monitors.
// Header, grid and footer all read this, or they drift apart.
const PROFILE_GRID = 'max-w-[1720px] px-4 sm:px-10'
// Quiet text actions at the right end of a section heading (Select, the dead-
// links review, Done): Body Large, ink-50.
const HEADING_ACTION =
  'whitespace-nowrap font-sans text-[14px] leading-5 tracking-[0.05em] text-black/50 transition-colors hover:text-ink'

const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, image_pref, is_private, outbound_url, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

// The grid renders a page at a time (components/LoadMoreSentinel) — the list
// page shares the same window.

export default function ProfileClient({
  username,
  initialProfile,
  initialBookmarks,
  initialLists,
  currentUserId,
  mightHaveMore,
  readOnlyPreview = false,
  previewDeadBullets,
}: {
  username: string
  initialProfile: any
  initialBookmarks: any[]
  initialLists: any[]
  currentUserId: string | null
  mightHaveMore: boolean
  // Dev preview (app/preview/owner-profile): real screens, writes stubbed.
  readOnlyPreview?: boolean
  // The preview can't call /api/dead-links (it needs the owner's session), so
  // it hands the drawer's rows in directly.
  previewDeadBullets?: any[]
}) {
  const router = useRouter()
  const supabase = readOnlyPreview ? createReadOnlyClient() : createClient()
  const extInstalled = useExtensionInstalled()

  const isOwner = !!currentUserId && currentUserId === initialProfile.id

  // Links the sweeper has confirmed gone (twice, on separate days) and that the
  // owner has not already answered for. Loaded after paint rather than with the
  // page: this is a drawer somebody opens occasionally, and the profile's
  // server work is the thing we spent real effort keeping down — a count in the
  // one-shot query would have cost the owner a whole round trip on every visit
  // to say "nothing to do" almost every time.
  const [deadBullets, setDeadBullets] = useState<any[] | null>(null)
  const [reviewingDead, setReviewingDead] = useState(false)
  // Review swaps the Recent Bullets grid for the dead links in place. From
  // deep in the feed that would leave you mid-grid with the heading far
  // above, so bring the section's heading into view (below the sticky search).
  const deadReviewRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!reviewingDead) return
    const el = deadReviewRef.current
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - 120
    if (window.scrollY > top) window.scrollTo({ top: Math.max(0, top) })
  }, [reviewingDead])
  const [profile, setProfile] = useState<any>(initialProfile)
  const [bookmarks, setBookmarks] = useState<any[]>(initialBookmarks)
  const [filtered, setFiltered] = useState<any[]>(initialBookmarks)
  // Save panel — collapsed by default, auto-opens on empty collections as the
  // onboarding affordance. Saving happens through the extension (it captures the
  // page from the user's own browser); this panel points them to it.
  const [saveOpen, setSaveOpen] = useState(isOwner && initialBookmarks.length === 0)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editName, setEditName] = useState('')
  const [editBio, setEditBio] = useState('')
  // "Latest Bullet: …" line — formatted in the viewer's LOCAL time, so computed
  // client-side (in the effect below) to avoid an SSR/client hydration mismatch.
  const [latestBulletLabel, setLatestBulletLabel] = useState<string | null>(null)
  // Links edit as an ORDERED url list (any platform — icon is detected at
  // render). newLink is the dashed add-row's draft.
  const [editLinkList, setEditLinkList] = useState<string[]>([])
  const [newLink, setNewLink] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  // Which bullet's detail modal is open (owner view). Looked up from `bookmarks`
  // so it always reflects the latest tags/note after edits.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Lists. Each: { id, name, slug, created_at, bookmark_ids: string[] }.
  const [lists, setLists] = useState<any[]>(initialLists)
  // Non-empty while the owner is searching — collapses the lists/recent layout
  // down to a flat results grid.
  const [query, setQuery] = useState('')
  // The search field sits above the sections (full width on phones) and, from
  // lg up, rides the top of the viewport once scrolled past — mymind's pill.
  // `searchStuck` gives it the floating shadow only while it's riding.
  const minSm = useMinSm()
  const searchSentinelRef = useRef<HTMLDivElement | null>(null)
  const [searchStuck, setSearchStuck] = useState(false)
  useEffect(() => {
    const el = searchSentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setSearchStuck(!e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const [showAllLists, setShowAllLists] = useState(false)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  // Owner only, and quietly: a failure here should cost nothing but the drawer.
  useEffect(() => {
    if (!isOwner) return
    if (readOnlyPreview) {
      setDeadBullets(previewDeadBullets ?? [])
      return
    }
    let cancelled = false
    fetch('/api/dead-links')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.bullets) setDeadBullets(d.bullets)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [isOwner])

  // How many bullets the grid currently reveals (see renderBulletGrid). Grows as
  // the scroll sentinel appears; resets to one page whenever the visible set
  // changes (search, entering/leaving a list) so we never render a huge grid
  // up front.
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE)
  useEffect(() => {
    setVisibleCount(RENDER_PAGE)
    // Leave the dead-links drawer too — it renders instead of the sections.
    setReviewingDead(false)
  }, [query, activeListId])
  // Debounce timer for the search — one request per pause, not per keystroke
  // (the embedding API is rate-limited, so per-keystroke calls 429 instantly).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reveal footer: hidden while browsing, slides in from the bottom on
  // scroll-up (or at the true end of the feed). The floating search pill lifts
  // to clear it — see the pill render below.
  const footerRevealed = useRevealFooter(true)
  // List-detail rename + share affordances.
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  // Extension install nudge — dismissible, persisted so we only ask once.
  const [extNudgeDismissed, setExtNudgeDismissed] = useState(true)
  useEffect(() => {
    setExtNudgeDismissed(localStorage.getItem('bulletin_ext_nudge_dismissed') === '1')
  }, [])
  const dismissExtNudge = () => {
    localStorage.setItem('bulletin_ext_nudge_dismissed', '1')
    setExtNudgeDismissed(true)
  }

  // Leaving / switching a list closes any in-progress rename.
  useEffect(() => { setRenaming(false) }, [activeListId])

  // Compute the "Latest Bullet" line from the newest bullet's timestamp
  // (bookmarks are ordered created_at desc, so [0] is the latest), in the
  // viewer's local time. e.g. "Latest Bullet: 6:00 PM EST, 08.08.26". Formatted
  // in an effect, not in render, because local time differs between the server
  // and the browser — see lib/timestampLabel.
  useEffect(() => {
    const label = formatTimestampLabel(bookmarks[0]?.created_at)
    setLatestBulletLabel(label && `Latest Bullet: ${label}`)
  }, [bookmarks])

  // Background full-load: the server only SSRs the newest page of bullets for a
  // fast first paint. Once hydrated, pull the complete set so search and list
  // membership cover everything. Non-blocking — the grid is already on screen, so
  // this just extends it with older bullets. We skip updating `filtered` if the
  // user has already started a search, to avoid clobbering their results.
  //
  // Deferred to browser idle: this ~1000-row fetch (plus the re-render that
  // mounts the extra bullets) would otherwise fire during first paint and fight
  // the visible cards' images for the main thread and network. requestIdleCallback
  // yields until the critical render + first images are underway, then loads the
  // rest. The windowed grid only shows one page up front anyway, so nothing the
  // user can see is waiting on this.
  useEffect(() => {
    if (!mightHaveMore) return
    let cancelled = false
    const run = () => {
      ;(async () => {
        const { data } = await supabase
          .from('bookmarks')
          .select(BULLET_COLS)
          .eq('user_id', initialProfile.id)
          .order('created_at', { ascending: false })
        if (cancelled || !data) return
        setBookmarks(data)
        setFiltered((prev) => (query.trim() ? prev : data))
      })()
    }
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined
    // Cap the idle wait so a busy tab still loads the full set within ~2s.
    const handle = ric ? ric(run, { timeout: 2000 }) : window.setTimeout(run, 200)
    return () => {
      cancelled = true
      if (ric && (window as any).cancelIdleCallback) (window as any).cancelIdleCallback(handle)
      else window.clearTimeout(handle)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pull the feed fresh after the quick-add box lands a link, so the new card
  // shows up at the top without a reload. Same query and same don't-clobber-
  // an-active-search rule as the background full-load above.
  const refreshBookmarks = async () => {
    const { data } = await supabase
      .from('bookmarks')
      .select(BULLET_COLS)
      .eq('user_id', initialProfile.id)
      .order('created_at', { ascending: false })
    if (!data) return
    setBookmarks(data)
    setFiltered((prev) => (query.trim() ? prev : data))
  }

  // Token + synonym fallback used when semantic search returns nothing.
  const SYNONYMS: Record<string, string[]> = {
    video: ['youtube', 'vimeo', 'film', 'movie'],
    article: ['blog', 'post', 'essay', 'medium', 'substack'],
    code: ['github', 'gitlab', 'repo', 'repository'],
    design: ['figma', 'dribbble', 'behance', 'ui', 'ux'],
    tweet: ['x.com', 'twitter'],
    paper: ['arxiv', 'pdf', 'research'],
    shop: ['store', 'product', 'buy', 'shopify'],
  }

  // Split into words on anything non-alphanumeric and reduce each to a crude
  // stem (drop a trailing plural) so "hat" ⇄ "hats" match either direction. Word
  // sets — not substrings — are what keep "hat" from matching "w[hat]", "t[hat]",
  // "c[hat]": the old substring haystack returned ~210 rows for "hat", almost all
  // noise. Stemmed word membership returns only true hits.
  const stem = (w: string) => w.replace(/(?:es|s)$/, '')
  const wordSet = (s: string) => {
    const out = new Set<string>()
    for (const w of s.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w) out.add(stem(w))
    }
    return out
  }

  const tokenize = (s: string) =>
    s.toLowerCase().split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)

  const expandTokens = (tokens: string[]) => {
    const out = new Set<string>()
    for (const t of tokens) {
      out.add(t)
      for (const syn of SYNONYMS[t] || []) out.add(syn)
    }
    return Array.from(out)
  }

  // Shortest query term we'll prefix-match. At 1 char "b" matches roughly every
  // bullet, which is noise, not narrowing; from 2 the result set is meaningful.
  const MIN_PREFIX = 2

  // Precompute each bullet's stemmed word sets ONCE per bookmark-set change.
  // `strong` = title + Haiku search keywords (the high-signal fields — a keyword
  // hit here is what surfaces the French "chapeau" bullet for the query "hat");
  // `weak` = description + url + domain. Building sets here (not per keystroke)
  // keeps the tokenizing/URL-parse work off every keystroke.
  //
  // The arrays mirror the sets: Sets give O(1) exact lookup, but prefix matching
  // has to scan, and re-deriving an array per keystroke per bullet would allocate
  // ~1k arrays on every character typed.
  const wordsById = useMemo(() => {
    const m = new Map<
      string,
      { strong: Set<string>; weak: Set<string>; strongArr: string[]; weakArr: string[] }
    >()
    for (const b of bookmarks) {
      let host = ''
      try { host = new URL(b.url).hostname.replace(/^www\./, '') } catch {}
      const strong = wordSet([b.title, b.keywords].filter(Boolean).join(' '))
      const weak = wordSet([b.description, b.url, host].filter(Boolean).join(' '))
      m.set(b.id, { strong, weak, strongArr: [...strong], weakArr: [...weak] })
    }
    return m
  }, [bookmarks])

  // Keyword search over the stemmed sets, ranked in four tiers: exact hits in
  // title/keywords, then PREFIX hits there, then the same two over description/
  // url. Original order within each tier.
  //
  // Prefix matching is what makes typing feel live — "bio" finds "biom", "fazi"
  // finds "fazit". Note prefix is NOT the substring search this replaced: "hat"
  // as a prefix matches "hats"/"hatch" but never "w[hat]"/"t[hat]"/"c[hat]",
  // which is what made the old substring haystack return ~210 junk rows. Exact
  // outranks prefix so a fully-typed word still wins.
  const tokenSearch = (query: string) => {
    const tokens = tokenize(query)
    if (tokens.length === 0) return bookmarks
    const terms = new Set<string>()
    for (const t of expandTokens(tokens)) for (const w of wordSet(t)) terms.add(w)
    if (terms.size === 0) return bookmarks

    const hasExact = (set: Set<string>) => {
      for (const t of terms) if (set.has(t)) return true
      return false
    }
    const hasPrefix = (arr: string[]) => {
      for (const t of terms) {
        if (t.length < MIN_PREFIX) continue
        for (const w of arr) if (w !== t && w.startsWith(t)) return true
      }
      return false
    }

    const strongExact: any[] = []
    const strongPrefix: any[] = []
    const weakExact: any[] = []
    const weakPrefix: any[] = []
    for (const b of bookmarks) {
      const w = wordsById.get(b.id)
      if (!w) continue
      if (hasExact(w.strong)) strongExact.push(b)
      else if (hasPrefix(w.strongArr)) strongPrefix.push(b)
      else if (hasExact(w.weak)) weakExact.push(b)
      else if (hasPrefix(w.weakArr)) weakPrefix.push(b)
    }
    return [...strongExact, ...strongPrefix, ...weakExact, ...weakPrefix]
  }

  // Monotonic id per semantic request. A slow response for an older query must
  // never clobber what the user is currently looking at — every keystroke (and
  // clearing the input) bumps the seq, and stale responses are dropped.
  const searchSeq = useRef(0)

  // Semantic re-rank pass. The grid already shows instant token-filter results
  // (set synchronously on the keystroke) — this runs after the debounce and,
  // when the embedding search lands, re-orders to semantic ranking. On error
  // or zero hits we simply keep the token results already on screen.
  const handleSearch = async (query: string) => {
    if (!query.trim() || !profile) return
    const seq = ++searchSeq.current

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: profile.id }),
      })
      if (!res.ok) return
      const data = await res.json()
      if (seq !== searchSeq.current) return // stale — a newer query superseded us
      const ids: string[] = (data.bookmarks || []).map((b: any) => b.id)
      if (ids.length === 0) return
      const byId = new Map(bookmarks.map((b) => [b.id, b]))
      const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[]
      if (ordered.length === 0) return
      // Union, keyword-hits FIRST, then semantic extras. For one-word queries a
      // bare embedding search is noisy (voyage-3-lite gives "hat" a high floor
      // against unrelated short titles), so the precise whole-word keyword hits —
      // including the cross-language ones the Haiku keywords unlock — must lead;
      // semantic then contributes the conceptual matches keywords didn't catch.
      const kw = tokenSearch(query)
      const seen = new Set(kw.map((b) => b.id))
      const semanticExtras = ordered.filter((b) => !seen.has(b.id))
      setFiltered([...kw, ...semanticExtras])
    } catch {
      // keep the instant token results already on screen
    }
  }

  // One keystroke pipeline for both search inputs (desktop toolbar box, mobile
  // drop-in bar): instant token filter now, debounced semantic re-rank after.
  const handleSearchInput = (v: string) => {
    setQuery(v)
    if (v.trim()) setActiveListId(null)
    // Any input change supersedes in-flight semantic requests (incl. clearing —
    // a late response must not repopulate a cleared box).
    searchSeq.current++
    setFiltered(v.trim() ? tokenSearch(v) : bookmarks)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (v.trim()) searchTimer.current = setTimeout(() => handleSearch(v), 250)
  }


  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    // The shelf caches its suggestions per list; without this a deleted bullet
    // keeps being offered from that cache.
    forgetSuggestion(id)
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    setFiltered((prev) => prev.filter((b) => b.id !== id))
  }

  // Custom outbound link (affiliate etc). Optimistic; the card's href flips
  // immediately because outboundOverride reads from state.
  const handleOutboundUpdate = async (id: string, outbound: string | null) => {
    const patch = (list: any[]) => list.map((b) => (b.id === id ? { ...b, outbound_url: outbound } : b))
    setBookmarks(patch)
    setFiltered(patch)
    const { error } = await supabase.from('bookmarks').update({ outbound_url: outbound }).eq('id', id)
    if (error && /outbound_url/i.test(error.message || '')) {
      console.warn('bookmarks.outbound_url column missing — apply migrations/027_outbound_url.sql in the Supabase SQL editor')
    }
  }

  const handleNoteUpdate = async (id: string, newNote: string | null) => {
    const { error } = await supabase.from('bookmarks').update({ note: newNote }).eq('id', id)
    if (error && /note/i.test(error.message || '')) {
      console.warn('bookmarks.note column missing — apply migrations/005_bookmarks_note.sql in the Supabase SQL editor')
    }
    const update = (list: any[]) => list.map((b) => b.id === id ? { ...b, note: newNote } : b)
    setBookmarks(update)
    setFiltered(update)
  }

  // A hand-edited title wins outright at render time (lib/cardTitle), so
  // whatever gets typed here is exactly what the card shows from now on.
  const handleTitleUpdate = async (id: string, newTitle: string) => {
    const update = (list: any[]) => list.map((b) => (b.id === id ? { ...b, title: newTitle } : b))
    setBookmarks(update)
    setFiltered(update)
    await supabase.from('bookmarks').update({ title: newTitle }).eq('id', id)
  }

  // ── Lists ───────────────────────────────────────────────────────────
  async function fetchLists(uid: string) {
    const shape = (data: any[] | null) =>
      (data || []).map((l: any) => ({
        ...l,
        bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
      }))
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name, slug, created_at, list_bookmarks(bookmark_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (!error) return shape(data)
      // Migration 009 (slug column) not applied yet — retry without it so lists
      // still render, just without their public-URL slug.
      if (/slug/i.test(error.message || '')) {
        const fallback = await supabase
          .from('lists')
          .select('id, name, created_at, list_bookmarks(bookmark_id)')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
        if (!fallback.error) return shape(fallback.data)
      }
      return []
    } catch {
      return []
    }
  }

  const handleCreateList = async (name: string, bookmarkIds: string[] = []) => {
    const clean = name.trim()
    if (!clean || !profile) return null
    // Mint a stable slug from the name, unique among this owner's lists. Frozen
    // after creation so the published /username/<slug> URL never breaks.
    const slug = uniqueSlug(clean, lists.map((l) => l.slug).filter(Boolean))

    // No description. A Haiku sentence used to be minted here before the
    // insert (a blocking round trip on every create) and nothing displays it:
    // the masthead dropped descriptions from the page. Removed 2026-09-22.
    let { data: list, error } = await supabase
      .from('lists')
      .insert({ user_id: profile.id, name: clean, slug })
      .select('id')
      .single()
    if (error && /slug/i.test(error.message || '')) {
      // Migration 009 not applied yet — fall back to a slugless insert.
      const retry = await supabase
        .from('lists')
        .insert({ user_id: profile.id, name: clean })
        .select('id')
        .single()
      list = retry.data
      error = retry.error
    }
    if (error || !list) return null
    if (bookmarkIds.length) {
      await supabase
        .from('list_bookmarks')
        .insert(bookmarkIds.map((bid) => ({ list_id: list.id, bookmark_id: bid })))
    }
    setLists(await fetchLists(profile.id))
    return list.id as string
  }

  const handleToggleMembership = async (listId: string, bookmarkId: string, add: boolean) => {
    if (add) {
      await supabase.from('list_bookmarks').insert({ list_id: listId, bookmark_id: bookmarkId })
    } else {
      await supabase
        .from('list_bookmarks')
        .delete()
        .eq('list_id', listId)
        .eq('bookmark_id', bookmarkId)
    }
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              bookmark_ids: add
                ? [...l.bookmark_ids, bookmarkId]
                : l.bookmark_ids.filter((x: string) => x !== bookmarkId),
            }
          : l
      )
    )
  }

  const handleDeleteList = async (listId: string) => {
    await supabase.from('lists').delete().eq('id', listId)
    setLists((prev) => prev.filter((l) => l.id !== listId))
    if (activeListId === listId) setActiveListId(null)
  }

  // Rename changes only the display name — the slug (and public URL) is frozen.
  // Optimistic, like the list page's masthead rename: shown at once, put
  // back if the write fails.
  const handleRenameList = async (listId: string, name: string) => {
    const clean = name.trim()
    if (!clean) return
    const before = lists.find((l) => l.id === listId)?.name
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: clean } : l)))
    const { error } = await supabase.from('lists').update({ name: clean }).eq('id', listId)
    if (error && before)
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: before } : l)))
  }

  // ── Bulk select ─────────────────────────────────────────────────────
  // Select mode turns every card into a toggle. Entered from the Select button
  // beside search, or a long-press on a card (touch). The action bar takes
  // the dock's place; shift-click selects a range in the order on screen.
  const [selecting, setSelecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [barMessage, setBarMessage] = useState<BarMessage>(null)
  const anchorRef = useRef<string | null>(null)
  // The order on screen, for shift-click ranges: the dead-links review when
  // it's open, else the feed (or search results).
  const filteredRef = useRef<any[]>(filtered)
  const reviewingRef = useRef(false)
  reviewingRef.current = reviewingDead
  const barTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A delete waiting out its undo window. Committed when the window closes,
  // when another delete starts, or when the page is hidden/left.
  const pendingDelete = useRef<{ ids: string[]; timer: ReturnType<typeof setTimeout> } | null>(null)

  const exitSelect = useCallback(() => {
    setSelecting(false)
    setReviewingDead(false)
    setSelectedIds(new Set())
    setBarMessage(null)
    anchorRef.current = null
    if (barTimer.current) clearTimeout(barTimer.current)
  }, [])

  // Also the way IN: a click on a card's tack starts select mode with it ticked.
  const handleSelect = useCallback((id: string, shift: boolean) => {
    setSelecting(true)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const anchor = anchorRef.current
      if (shift && anchor && anchor !== id) {
        const order = filteredRef.current.map((b: any) => b.id)
        const a = order.indexOf(anchor)
        const b = order.indexOf(id)
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          for (let i = lo; i <= hi; i++) next.add(order[i])
        }
      } else if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      anchorRef.current = id
      return next
    })
    setBarMessage(null)
  }, [])

  // Long-press (touch) enters select mode with that card ticked, Photos-style.
  // The click the release would otherwise fire — opening the link — is eaten.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressFired = useRef(false)
  const pressStart = (e: React.PointerEvent, id: string) => {
    if (!isOwner || selecting || e.pointerType !== 'touch') return
    pressFired.current = false
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = setTimeout(() => {
      pressFired.current = true
      setSelecting(true)
      setSelectedIds(new Set([id]))
      anchorRef.current = id
      try { navigator.vibrate?.(10) } catch {}
    }, 450)
  }
  const pressEnd = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  const pressClickGuard = (e: React.MouseEvent) => {
    if (!pressFired.current) return
    pressFired.current = false
    e.preventDefault()
    e.stopPropagation()
  }

  const flashThenExit = (text: string) => {
    setBarMessage({ text })
    if (barTimer.current) clearTimeout(barTimer.current)
    barTimer.current = setTimeout(exitSelect, 2200)
  }

  const plural = (n: number) => `${n} bullet${n === 1 ? '' : 's'}`

  // Publish = file into lists (a bullet goes public by being in one).
  // Written first, then reflected — a failed insert leaves the page honest.
  const handleBulkPublish = async (listIds: string[]) => {
    const ids = [...selectedIds]
    if (!ids.length || !listIds.length) return
    let failed = false
    const added: Record<string, string[]> = {}
    for (const listId of listIds) {
      const l = lists.find((x) => x.id === listId)
      const have = new Set<string>(l?.bookmark_ids || [])
      const toAdd = ids.filter((id) => !have.has(id))
      for (let i = 0; i < toAdd.length; i += 500) {
        const { error } = await supabase
          .from('list_bookmarks')
          .insert(toAdd.slice(i, i + 500).map((bid) => ({ list_id: listId, bookmark_id: bid })))
        if (error) failed = true
      }
      added[listId] = toAdd
    }
    setLists((prev) =>
      prev.map((l) => (added[l.id] ? { ...l, bookmark_ids: [...added[l.id], ...l.bookmark_ids] } : l))
    )
    if (failed) {
      setBarMessage({ text: 'Some didn’t add. Try again.' })
      return
    }
    const target =
      listIds.length === 1
        ? lists.find((l) => l.id === listIds[0])?.name ?? 'your list'
        : `${listIds.length} lists`
    flashThenExit(`Added ${plural(ids.length)} to ${target}`)
  }

  const commitDelete = useCallback(
    async (ids: string[]) => {
      for (let i = 0; i < ids.length; i += 200) {
        await supabase.from('bookmarks').delete().in('id', ids.slice(i, i + 200))
      }
      ids.forEach((id) => forgetSuggestion(id))
      const gone = new Set(ids)
      setLists((prev) => prev.map((l) => ({ ...l, bookmark_ids: l.bookmark_ids.filter((x: string) => !gone.has(x)) })))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  )
  const flushPendingDelete = useCallback(() => {
    const p = pendingDelete.current
    if (!p) return
    clearTimeout(p.timer)
    pendingDelete.current = null
    commitDelete(p.ids)
  }, [commitDelete])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flushPendingDelete()
    }
    window.addEventListener('pagehide', flushPendingDelete)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flushPendingDelete)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushPendingDelete])

  // Delete: gone from the grid at once, committed after the undo window.
  const handleBulkDelete = () => {
    flushPendingDelete()
    const gone = new Set(selectedIds)
    const ids = [...gone]
    if (!ids.length) return
    const removed = bookmarks.filter((b) => gone.has(b.id))
    const filteredOrder = new Map(filtered.map((b: any, i: number) => [b.id, i]))
    const byNewest = (a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    const removedDead = (deadBullets || []).filter((b) => gone.has(b.id))
    setBookmarks((prev) => prev.filter((b) => !gone.has(b.id)))
    setFiltered((prev) => prev.filter((b) => !gone.has(b.id)))
    setDeadBullets((prev) => (prev ? prev.filter((b) => !gone.has(b.id)) : prev))
    setSelectedIds(new Set())
    const timer = setTimeout(() => {
      pendingDelete.current = null
      commitDelete(ids)
      // Mid-review, stay in the review; elsewhere the job's done.
      if (reviewingRef.current) setBarMessage(null)
      else exitSelect()
    }, 5000)
    pendingDelete.current = { ids, timer }
    if (barTimer.current) clearTimeout(barTimer.current)
    setBarMessage({
      text: `Deleted ${plural(ids.length)}`,
      undo: () => {
        clearTimeout(timer)
        pendingDelete.current = null
        setBookmarks((prev) => [...prev, ...removed].sort(byNewest))
        setFiltered((prev) =>
          query.trim()
            ? [...prev, ...removed.filter((b) => filteredOrder.has(b.id))].sort(
                (a, b) => (filteredOrder.get(a.id) ?? 1e9) - (filteredOrder.get(b.id) ?? 1e9)
              )
            : [...prev, ...removed].sort(byNewest)
        )
        if (removedDead.length) setDeadBullets((prev) => [...(prev || []), ...removedDead])
        setSelectedIds(gone)
        setBarMessage(null)
      },
    })
  }

  // Lists render biggest-first — the fullest lists are the ones worth surfacing.
  // Ties fall back to newest (state is already ordered created_at desc). Sort a
  // copy so we don't mutate the lists state array in place.
  const sortedLists = useMemo(
    () => [...lists].sort((a, b) => b.bookmark_ids.length - a.bookmark_ids.length),
    [lists]
  )

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) : null
  const listBullets = activeList
    ? bookmarks.filter((b) => activeList.bookmark_ids.includes(b.id))
    : []

  // Up to 4 preview thumbnails for a list card, newest link first (so a small
  // list's single preview shows the latest saved link).
  const bookmarkById = useMemo(() => new Map(bookmarks.map((b) => [b.id, b])), [bookmarks])

  // The review grid's cards: the full feed row where the page has it (so it
  // renders exactly as in the feed), else the drawer's own row — the feed
  // doesn't hold every bullet, and a dead one is usually an old one.
  // Deleting drops a bullet from deadBullets directly, so no feed filter.
  const deadItems = useMemo(
    () => (deadBullets || []).map((d: any) => bookmarkById.get(d.id) ?? d),
    [deadBullets, bookmarkById]
  )
  filteredRef.current = reviewingDead ? deadItems : filtered

  // Review opens straight into select mode: the cards' rings are the way to
  // act on them (the per-card Keep/Delete buttons went with bulk select).
  const openDeadReview = () => {
    setSelectedIds(new Set())
    anchorRef.current = null
    setBarMessage(null)
    setReviewingDead(true)
    setSelecting(true)
  }
  // Leave the review once there's nothing left in it.
  useEffect(() => {
    if (reviewingDead && deadBullets && deadBullets.length === 0 && !barMessage) exitSelect()
  }, [reviewingDead, deadBullets, barMessage, exitSelect])

  // Keep: "I know, and I want it anyway". Recorded without touching
  // link_status (the link IS gone); it just stops asking.
  const handleBulkKeep = async () => {
    const ids = [...selectedIds]
    if (!ids.length) return
    const kept = new Set(ids)
    setDeadBullets((prev) => (prev ? prev.filter((b) => !kept.has(b.id)) : prev))
    setSelectedIds(new Set())
    anchorRef.current = null
    if (!readOnlyPreview) {
      await fetch('/api/dead-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      }).catch(() => {})
    }
    setBarMessage({ text: `Kept ${ids.length} link${ids.length === 1 ? '' : 's'}` })
    if (barTimer.current) clearTimeout(barTimer.current)
    barTimer.current = setTimeout(() => setBarMessage(null), 2200)
  }

  // Which list each bullet belongs to (fullest list wins) → the card's list
  // line: its name + a link to the list's public page (when it has a slug).
  const listByBookmark = useMemo(() => {
    const m = new Map<string, { name: string; href: string | null }>()
    for (const l of sortedLists)
      for (const bid of l.bookmark_ids as string[])
        if (!m.has(bid))
          m.set(bid, { name: l.name, href: l.slug ? `/${profile.username}/${l.slug}` : null })
    return m
  }, [sortedLists, profile.username])
  const listThumbs = (l: any): string[] =>
    (l.bookmark_ids as string[])
      .map((id) => bookmarkById.get(id))
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
      )
      .map((b: any) => b.image_url || b.screenshot_url)
      .filter(Boolean)
      // 8 feeds the card's filmstrip — enough sequence for the drifting
      // carousel to travel through before it loops. (The still used 4; the
      // strip's imgs are lazy, so the extra tiles don't tax first paint.)
      .slice(0, 8)

  // Order-preserving masonry (round-robin across columns) — a plain CSS-columns
  // flow would fill column-major and scramble the created_at-desc order.
  // Pass ONLY stable, actually-rendered props so React.memo on PrimaryCard holds
  // across search keystrokes (setSelectedId is a stable setter; listName is a
  // stable string), keeping typing smooth as the collection grows.
  const renderBulletGrid = (items: any[]) => (
    <>
      <Masonry>
        {items.slice(0, visibleCount).map((b) => (
          <div
            key={b.id}
            // Owner: no iOS link-preview callout, so a long-press can mean select.
            className={`relative ${isOwner ? '[-webkit-touch-callout:none]' : ''}`}
            onPointerDown={isOwner ? (e) => pressStart(e, b.id) : undefined}
            onPointerUp={isOwner ? pressEnd : undefined}
            onPointerCancel={isOwner ? pressEnd : undefined}
            onPointerLeave={isOwner ? pressEnd : undefined}
            onClickCapture={isOwner ? pressClickGuard : undefined}
            onContextMenu={isOwner ? (e) => { if (pressFired.current) e.preventDefault() } : undefined}
          >
          <PrimaryCard
            id={b.id}
            url={b.url}
            title={b.title}
            description={b.description}
            imageUrl={b.image_url}
            screenshotUrl={b.screenshot_url}
            faviconUrl={b.favicon_url}
            rawMetadata={b.raw_metadata}
            place={b.place}
                product={b.product}
                customImage={b.customImage}
            cardType={b.card_type}
            imagePref={b.image_pref}
            listName={listByBookmark.get(b.id)?.name ?? null}
            listHref={listByBookmark.get(b.id)?.href ?? null}
            onOpen={isOwner ? setSelectedId : undefined}
            utmCampaign={username}
            outboundOverride={b.outbound_url}
            selecting={selecting}
            selected={selecting && selectedIds.has(b.id)}
            onSelect={isOwner ? handleSelect : undefined}
          />
          </div>
        ))}
      </Masonry>
      {items.length > visibleCount && (
        <LoadMoreSentinel
          onReach={() =>
            setVisibleCount((c) => Math.min(c + RENDER_PAGE, items.length))
          }
        />
      )}
    </>
  )

  if (!profile) {
    return <main className="min-h-screen"><div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div></main>
  }

  return (
    <main className="min-h-screen">
      <BulletinHeader
        // Someone reading a stranger's bulletin has no account to sign IN to —
        // the invitation is to make one. Keyed off currentUserId, not isOwner:
        // a signed-in visitor on someone else's profile isn't the owner either,
        // and was being told to sign in while already signed in.
        // During the private beta that means the landing page's request-access
        // capture, not the /start wizard.
        action={
          currentUserId
            ? { label: 'Log out', onClick: handleSignOut }
            : { label: 'Sign up', href: '/' }
        }
        logoClassName="h-[32px] sm:h-[44px]"
        widthClassName={PROFILE_GRID}
        stickyLogo
        tagline={
          <CopyTagline path={`/${profile.username}`}>
            A home for <span className="text-ink underline decoration-black/20 underline-offset-2">{(profile.display_name || profile.username).split(' ')[0]}&apos;s</span> links
          </CopyTagline>
        }
      />
      {/* width = exactly a 4-col grid (4×272 + 3×24 gap = 1160) + px-6, so the
          strip's right edge (tabs) lines up with the rightmost card column. */}
      {/* pb-40 clears the revealed footer bar + lifted search pill at the true
          end of the feed. (The old min-h-screen push-the-footer-past-the-fold
          hack is gone — the footer is out of flow now.) */}
      {/* Top padding matches the list masthead's air below the header (~88px
          desktop / ~48 mobile), so the profile, its Lists tab, and a list page
          all breathe on the same rhythm. */}
      <div className={`mx-auto ${PROFILE_GRID} pb-40 pt-12 sm:pt-[88px]`}>
        {profile.is_preview && <PreviewBanner />}
        {isOwner && <WelcomeBanner />}

        {/* Hero — centered identity block (name · bio · links · edit).
            Margin below matches the list masthead's title→meta gap (~96px),
            so both pages run the same 88 → hero → 96 → toolbar → 32 rhythm.
            Mobile gets 64px (was 40) — the identity block wants clear air
            before the toolbar/cards start. */}
        <div className="mb-16 sm:mb-24">
          <ProfileIdentity
            name={profile.display_name || profile.username}
            bio={profile.bio}
            latestBullet={latestBulletLabel}
            links={profile.links}
            trailing={
              isOwner && !editingProfile ? (
                <button
                  onClick={() => {
                    setEditingProfile(true)
                    setEditName(profile.display_name || '')
                    // Legacy two-line bios open as one middot-joined line.
                    setEditBio(
                      (profile.bio || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' · ')
                    )
                    setEditLinkList(normalizeProfileLinks(profile.links))
                    setNewLink('')
                  }}
                  aria-label="Edit profile"
                  title="Edit profile"
                  // Hover-reveal on desktop (keeps the identity block clean);
                  // always visible on touch (no hover) and on keyboard focus.
                  className="mt-1 text-black/35 opacity-100 transition-all hover:text-ink sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              ) : null
            }
          />

          {/* Edit profile form — the gray plate under the identity block.
              Links are a free-form ordered list: paste any url, the platform
              icon is detected at render (instagram, tiktok, whatever). */}
          {editingProfile && (
            <div className="mx-auto mt-8 max-w-2xl rounded-[24px] bg-[#F4F4F4] p-5 text-left sm:p-8">
              <label className="mb-2 block font-sans text-[14px] font-[500] text-black/40">name</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={profile.username}
                maxLength={60}
                className="w-full rounded-[16px] border border-[#E3E3E3] bg-white px-5 py-3.5 font-sans text-[15px] font-[500] text-ink placeholder:text-black/30 focus:border-black/40 focus:outline-none"
              />
              <label className="mb-2 mt-5 block font-sans text-[14px] font-[500] text-black/40">description</label>
              <input
                type="text"
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Venture Designer @ Founders Factory"
                maxLength={120}
                className="w-full rounded-[16px] border border-[#E3E3E3] bg-white px-5 py-3.5 font-sans text-[15px] font-[500] text-ink placeholder:text-black/30 focus:border-black/40 focus:outline-none"
              />
              <label className="mb-2 mt-5 block font-sans text-[14px] font-[500] text-black/40">links</label>
              <div className="space-y-3">
                {editLinkList.map((url, i) => (
                  <div
                    key={`${url}-${i}`}
                    className="flex items-center gap-3 rounded-[16px] border border-[#E3E3E3] bg-white px-4 py-3.5"
                  >
                    <span className="shrink-0 text-black/70">
                      {LINK_ICONS[detectPlatform(url)] ?? LINK_ICONS.website}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-sans text-[15px] font-[500] text-ink">
                      {linkLabel(url)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditLinkList((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove ${linkLabel(url)}`}
                      className="shrink-0 p-1 text-black/30 transition-colors hover:text-ink"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        <path d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  </div>
                ))}
                <input
                  type="text"
                  value={newLink}
                  onChange={(e) => setNewLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const url = coerceUrl(newLink)
                    if (!url) return
                    setEditLinkList((prev) => (prev.includes(url) ? prev : [...prev, url]))
                    setNewLink('')
                  }}
                  placeholder="+ add link (paste a url, hit enter)"
                  enterKeyHint="done"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full rounded-[16px] border border-dashed border-black/20 bg-transparent px-5 py-3.5 font-sans text-[15px] font-[500] text-ink placeholder:text-black/35 focus:border-black/40 focus:outline-none"
                />
              </div>
              {profileSaveError && (
                <p className="mt-4 font-sans text-[13px] text-red-500">{profileSaveError}</p>
              )}
              <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6">
                <button
                  onClick={() => { setEditingProfile(false); setProfileSaveError(null) }}
                  className="order-2 text-center font-sans text-[15px] font-[500] text-black/40 transition-colors hover:text-ink sm:order-1"
                >
                  cancel
                </button>
                <button
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true)
                    setProfileSaveError(null)
                    // Blank name → null, so the header falls back to @username.
                    const cleanName = editName.trim() || null
                    const joinedBio = editBio.trim() || null
                    // A valid url still sitting in the add-row rides along —
                    // "type it and hit save" shouldn't silently drop it.
                    const draft = coerceUrl(newLink)
                    const cleanLinks =
                      draft && !editLinkList.includes(draft)
                        ? [...editLinkList, draft]
                        : editLinkList

                    let { error } = await supabase
                      .from('profiles')
                      .update({
                        display_name: cleanName,
                        bio: joinedBio,
                        links: cleanLinks,
                      })
                      .eq('id', profile.id)

                    if (error && /links/i.test(error.message || '')) {
                      const retry = await supabase
                        .from('profiles')
                        .update({ display_name: cleanName, bio: joinedBio })
                        .eq('id', profile.id)
                      error = retry.error
                      if (!error) {
                        setProfileSaveError(
                          'bio saved — social links need a quick db migration before they can be stored'
                        )
                      }
                    }

                    if (error) {
                      setProfileSaveError(error.message || 'something went wrong saving your profile')
                      setSavingProfile(false)
                      return
                    }

                    setProfile({ ...profile, display_name: cleanName, bio: joinedBio, links: cleanLinks })
                    setEditingProfile(false)
                    setSavingProfile(false)
                  }}
                  className="order-1 rounded-full bg-ink px-8 py-3.5 font-sans text-[15px] font-[600] text-white transition-opacity hover:opacity-90 disabled:opacity-50 sm:order-2"
                >
                  {savingProfile ? 'saving…' : 'save'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Controls — main feed only; hidden inside a list. Tabs are gone:
            Lists and Recent Bullets stack as sections below, so this row is
            just the owner's search (visitors get no row at all). */}
        {/* Search. One row over both sections: a full-width field on
            phones (the app's and mymind's placement), a centred field from sm
            up that, at lg+, rides the top of the viewport once scrolled past
            (sticky; the pinned wordmark keeps the top-left corner). Our field
            dress — 12px radius, the #BCBCBC line — with the dock's float
            shadow only while it's riding. (Bulk select starts from a card's
            tack, not a button here.) */}
        {!activeList && isOwner && (
          <>
            <div ref={searchSentinelRef} aria-hidden className="h-px" />
            <div className="relative z-30 mb-8 flex items-center justify-center gap-3 sm:mb-12 lg:sticky lg:top-5">
              <div className="relative w-full min-w-0 sm:max-w-[440px] lg:max-w-[560px]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-black/35">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  value={query}
                  placeholder={minSm ? 'Search your Bulletin' : 'Search'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  aria-label="Search your links"
                  data-1p-ignore
                  data-lpignore="true"
                  onChange={(e) => handleSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape' && query && !selecting) handleSearchInput('')
                  }}
                  // globals.css floors inputs at 16px under 640px (no iOS zoom).
                  className={`h-[56px] w-full rounded-[12px] border border-[#BCBCBC]/70 bg-white pl-12 pr-12 font-sans text-[14px] font-[600] leading-5 text-black transition-shadow duration-[180ms] ease-[cubic-bezier(.22,.61,.36,1)] placeholder:font-[400] placeholder:text-black/40 focus:border-black/40 focus:outline-none sm:h-[62px] [&::-webkit-search-cancel-button]:hidden ${
                    searchStuck ? 'lg:shadow-[0_12px_36px_-12px_rgba(35,30,20,0.35),0_3px_10px_-6px_rgba(35,30,20,0.22)]' : ''
                  }`}
                />
                {query && (
                  <button
                    onClick={() => handleSearchInput('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center text-black/40 transition-colors hover:text-ink"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Owner-only save panel — collapsible. Empty state gets larger
            messaging (onboarding); populated state is more compact. */}
        {isOwner && saveOpen && (
          <div className="mb-10 rounded-2xl border border-gray-200 bg-gray-50/50 p-6 relative">
            <button
              onClick={() => setSaveOpen(false)}
              aria-label="close save panel"
              className="absolute top-3 right-3 w-7 h-7 rounded-full text-gray-300 hover:text-gray-600 hover:bg-white transition-colors flex items-center justify-center text-sm"
            >
              ✕
            </button>

            {bookmarks.length === 0 ? (
              <div className="mb-1">
                <h2 className="text-xl font-light text-gray-900 mb-1">save your first bullet</h2>
                <p className="text-sm text-gray-500">
                  Bulletin saves straight from your browser — here&apos;s how:
                </p>
              </div>
            ) : (
              <h2 className="text-sm font-medium text-gray-700">how to save</h2>
            )}

            {/* Saving is extension-only: it captures the page from your own
                browser, so even paywalled / blocked pages get a real card. */}
            <SaveHelp extInstalled={extInstalled} />
          </div>
        )}

        {/* ── Search results (flat grid) ── */}
        {!activeList && query.trim() && (
          <>
            {filtered.length > 0 ? (
              renderBulletGrid(filtered)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">no matches</p>
              </div>
            )}
          </>
        )}

        {/* ── Home: LISTS section stacked above RECENT BULLETS (tabs are
            gone — Figma 1049:80264). Each section carries a Headline/Large
            heading (Mier A 600 20/24): "Your …" to the owner, "Their …" to a
            visitor. A visitor with no lists gets no Lists section at all —
            a heading over an empty state advertises an absence. ── */}
        {!activeList && !query.trim() && (
          <>
          {(isOwner || lists.length > 0) && (
          <section className="mb-12 sm:mb-20">
            <h2 className="mb-8 font-sans text-[20px] font-[600] leading-[24px] text-ink sm:mb-16">
              {isOwner ? 'Your Lists' : 'Their Lists'}
            </h2>
            {/* Equal columns that fill the width at every breakpoint — a fixed-
                width auto-fill grid left-packed the cards and left a big empty
                gap on the right at mid-wide viewports. One gap value both
                ways, so rows and columns read as the same grid. */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
                {sortedLists.map((l) => (
                  <CollectionCard
                    key={l.id}
                    name={l.name}
                    count={l.bookmark_ids.length}
                    thumbs={listThumbs(l)}
                    // Clicking a list navigates straight to its own URL — for
                    // the owner too (the list page carries the owner controls).
                    // A slugless list (pre-migration) still falls back to the
                    // in-page view since it has no URL yet.
                    {...(l.slug
                      ? { href: `/${profile.username}/${l.slug}` }
                      : { onClick: () => setActiveListId(l.id) })}
                  />
                ))}

                {/* No "Create New List" card here any more: lists get made in
                    the bottom-right dock (its first pill), and the new card
                    simply appears in this grid. */}
            </div>

          </section>
          )}

          <section ref={deadReviewRef}>
            <div className="mb-8 flex items-baseline justify-between gap-4 sm:mb-16">
              <h2 className="font-sans text-[20px] font-[600] leading-[24px] text-ink">
                {reviewingDead
                  ? `${deadItems.length} Dead ${deadItems.length === 1 ? 'Link' : 'Links'}`
                  : isOwner ? 'Your Recent Bullets' : 'Their Recent Bullets'}
              </h2>
              <span className="flex shrink-0 items-baseline gap-5">
                {/* Dead links ride the right end of this row (Tim, 2026-09-24):
                    it's the bullets they belong to, not the lists. "Confirmed"
                    = gone on two sweeps days apart; a 403 never counts. */}
                {isOwner && reviewingDead ? (
                  <button onClick={exitSelect} className={HEADING_ACTION}>
                    Done
                  </button>
                ) : (
                  <>
                    {isOwner && !!deadBullets?.length && (
                      <button onClick={openDeadReview} className={HEADING_ACTION}>
                        <span className="sm:hidden">{deadBullets.length} dead</span>
                        <span className="hidden sm:inline">
                          {deadBullets.length} {deadBullets.length === 1 ? 'link looks' : 'links look'} dead &middot; Review
                        </span>
                      </button>
                    )}
                    {/* Phones have no hover, so no tack to click: a quiet way
                        in beside the long-press. Desktop starts from the tack. */}
                    {isOwner && bookmarks.length > 0 && (
                      <button
                        onClick={() => (selecting ? exitSelect() : setSelecting(true))}
                        className={`${HEADING_ACTION} sm:hidden`}
                      >
                        {selecting ? 'Done' : 'Select'}
                      </button>
                    )}
                  </>
                )}
              </span>
            </div>
            {reviewingDead ? (
              <>
                <p className="-mt-4 mb-8 max-w-[52ch] font-serif text-[15px] leading-[1.5] text-black/50 sm:-mt-10 sm:mb-12">
                  Checked twice, days apart, and gone both times. Select the
                  ones to delete, or keep the ones you want anyway.
                </p>
                {renderBulletGrid(deadItems)}
              </>
            ) : bookmarks.length > 0 ? (
              renderBulletGrid(filtered)
            ) : (
              <div className="py-16 text-center">
                <p className="label text-black/40">No bullets yet</p>
              </div>
            )}
          </section>
          </>
        )}

        {/* ── List detail ── */}
        {activeList && (
          <>
            <div className="mb-8">
              <button
                onClick={() => setActiveListId(null)}
                className="text-sm text-stone-400 hover:text-ink"
              >
                ← back
              </button>
              <div className="mt-2 flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {isOwner && renaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                          await handleRenameList(activeList.id, renameValue)
                          setRenaming(false)
                        } else if (e.key === 'Escape') {
                          setRenaming(false)
                        }
                      }}
                      onBlur={() => setRenaming(false)}
                      className="w-full bg-transparent border-b border-stone-300 pb-1 font-serif text-2xl italic text-ink focus:outline-none focus:border-stone-500"
                    />
                  ) : (
                    <div className="flex items-baseline gap-2 min-w-0">
                      <h2 className="truncate font-serif text-2xl font-normal italic tracking-tight text-ink">
                        {activeList.name}
                      </h2>
                      {isOwner && (
                        <button
                          onClick={() => { setRenameValue(activeList.name); setRenaming(true) }}
                          aria-label="rename list"
                          title="rename"
                          className="shrink-0 text-stone-300 hover:text-ink transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs uppercase tracking-wider text-stone-400">
                    <span>{listBullets.length} {listBullets.length === 1 ? 'bullet' : 'bullets'}</span>
                    {activeList.slug && (
                      <Link
                        href={`/${profile.username}/${activeList.slug}`}
                        className="normal-case tracking-normal text-stone-400 hover:text-ink"
                      >
                        view public page →
                      </Link>
                    )}
                  </div>
                </div>
                {isOwner && (
                  <button
                    onClick={() => handleDeleteList(activeList.id)}
                    className="shrink-0 text-sm text-stone-400 hover:text-red-600"
                  >
                    delete list
                  </button>
                )}
              </div>
            </div>
            {listBullets.length > 0 ? (
              renderBulletGrid(listBullets)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">
                  empty list{isOwner ? ' — open a bullet and add it to this list' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bullet detail modal — owner view, opened by clicking a card */}
      {isOwner && selectedId && (() => {
        const bullet = bookmarks.find((b) => b.id === selectedId)
        if (!bullet) return null
        return (
          <BulletDetail
            bullet={bullet}
            lists={lists}
            onClose={() => setSelectedId(null)}
            onNoteUpdate={handleNoteUpdate}
            onDelete={handleDelete}
            onToggleListMembership={handleToggleMembership}
            onCreateList={handleCreateList}
            onTitleUpdate={handleTitleUpdate}
            onOutboundUpdate={handleOutboundUpdate}
            utmCampaign={username}
            // The in-page list view (slugless legacy lists) gets the same
            // Remove from {list} as the list page.
            currentList={activeList ? { id: activeList.id, name: activeList.name } : null}
          />
        )
      })()}

      {/* Reveal-on-scroll-up. The feed is effectively endless, so instead of a
          bottom-anchored footer this is a fixed glassy bar that slides in when
          the reader scrolls up (or hits the true end) and tucks away while
          browsing down.
          
          For everyone, not just the owner: the feed is just as endless for a
          visitor, and gating it meant anyone arriving at a shared profile got
          no footer at all — no privacy link, no extension link, nothing. The
          Import button below stays owner-only; it is an action, not chrome. */}
      <SiteFooter reveal revealed={footerRevealed} widthClassName={PROFILE_GRID} />
      {isOwner && selecting && (
        <SelectionBar
          count={selectedIds.size}
          onDone={exitSelect}
          onDelete={handleBulkDelete}
          onPublish={handleBulkPublish}
          primary={reviewingDead ? { label: 'Keep', onClick: handleBulkKeep } : undefined}
          lists={sortedLists.map((l) => ({ id: l.id, name: l.name }))}
          onCreateList={(name) => handleCreateList(name)}
          message={barMessage}
        />
      )}
      {isOwner && !selecting && !readOnlyPreview && (
        <ImportFab
          widthClassName={PROFILE_GRID}
          lists={sortedLists.map((l) => ({ id: l.id, name: l.name }))}
          onSaved={refreshBookmarks}
          onListsChanged={async () => setLists(await fetchLists(profile.id))}
          onCreateList={(name) => handleCreateList(name)}
        />
      )}
    </main>
  )
}
