'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatTimestampLabel } from '@/lib/timestampLabel'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { CopyTagline } from '@/components/CopyTagline'
import { BulletinHeader } from '@/components/BulletinHeader'
import { CollectionCard } from '@/components/CollectionCard'
import { ProfileIdentity } from '@/components/ProfileIdentity'
import { BulletDetail } from '@/components/BulletDetail'
import { SaveHelp } from '@/components/SaveHelp'
import { WelcomeBanner } from '@/components/WelcomeBanner'
import { ImportFab } from '@/components/ImportFab'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'
import { SiteFooter } from '@/components/SiteFooter'
import { useRevealFooter } from '@/lib/useRevealFooter'
import { uniqueSlug } from '@/lib/slug'

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

const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, image_pref, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

// How many bullets to render at once. A power profile holds ~1000 bullets;
// mounting them all floods the DOM and fires ~1000 image-optimizer requests in
// one burst. We render a page at a time and grow as the sentinel scrolls into
// view, so only what's near the viewport ever hits the optimizer.
const RENDER_PAGE = 48

// Invisible tripwire at the tail of the grid. When it scrolls within 800px of
// the viewport it calls onReach, which reveals the next RENDER_PAGE of bullets.
function LoadMoreSentinel({ onReach }: { onReach: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) onReach() },
      { rootMargin: '800px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onReach])
  return <div ref={ref} aria-hidden className="col-span-full h-px" />
}

export default function ProfileClient({
  username,
  initialProfile,
  initialBookmarks,
  initialLists,
  currentUserId,
  mightHaveMore,
}: {
  username: string
  initialProfile: any
  initialBookmarks: any[]
  initialLists: any[]
  currentUserId: string | null
  mightHaveMore: boolean
}) {
  const router = useRouter()
  const supabase = createClient()
  const extInstalled = useExtensionInstalled()

  const isOwner = !!currentUserId && currentUserId === initialProfile.id
  const [profile, setProfile] = useState<any>(initialProfile)
  const [bookmarks, setBookmarks] = useState<any[]>(initialBookmarks)
  const [filtered, setFiltered] = useState<any[]>(initialBookmarks)
  // Save panel — collapsed by default, auto-opens on empty collections as the
  // onboarding affordance. Saving happens through the extension (it captures the
  // page from the user's own browser); this panel points them to it.
  const [saveOpen, setSaveOpen] = useState(isOwner && initialBookmarks.length === 0)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editBio2, setEditBio2] = useState('')
  // "Latest Bullet: …" line — formatted in the viewer's LOCAL time, so computed
  // client-side (in the effect below) to avoid an SSR/client hydration mismatch.
  const [latestBulletLabel, setLatestBulletLabel] = useState<string | null>(null)
  const [editLinks, setEditLinks] = useState<any>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  // Which bullet's detail modal is open (owner view). Looked up from `bookmarks`
  // so it always reflects the latest tags/note after edits.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Lists. Each: { id, name, is_private, created_at, bookmark_ids: string[] }.
  const [lists, setLists] = useState<any[]>(initialLists)
  // Non-empty while the owner is searching — collapses the lists/recent layout
  // down to a flat results grid.
  const [query, setQuery] = useState('')
  const [showAllLists, setShowAllLists] = useState(false)
  const [activeListId, setActiveListId] = useState<string | null>(null)
  // Profile view tab — Recent bullets vs the Lists collection grid. Seeded from
  // ?tab= so a list page's "All lists" back link can return you to the tab you
  // actually came from; the tab stays client state after that (switching tabs
  // doesn't push history — this is an entry point, not a route).
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'recent' | 'lists'>(
    searchParams?.get('tab') === 'lists' ? 'lists' : 'recent'
  )
  // How many bullets the grid currently reveals (see renderBulletGrid). Grows as
  // the scroll sentinel appears; resets to one page whenever the visible set
  // changes (search, tab switch, entering/leaving a list) so we never render a
  // huge grid up front.
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE)
  useEffect(() => {
    setVisibleCount(RENDER_PAGE)
  }, [query, activeTab, activeListId])
  // Debounce timer for the search — one request per pause, not per keystroke
  // (the embedding API is rate-limited, so per-keystroke calls 429 instantly).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Reveal footer: hidden while browsing, slides in from the bottom on
  // scroll-up (or at the true end of the feed). The floating search pill lifts
  // to clear it — see the pill render below.
  const footerRevealed = useRevealFooter(isOwner)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  // List-detail rename + share affordances.
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    setFiltered((prev) => prev.filter((b) => b.id !== id))
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
        .select('id, name, slug, is_private, description, created_at, list_bookmarks(bookmark_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (!error) return shape(data)
      // Migration 009 (slug column) not applied yet — retry without it so lists
      // still render, just without their public-URL slug.
      if (/slug/i.test(error.message || '')) {
        const fallback = await supabase
          .from('lists')
          .select('id, name, is_private, description, created_at, list_bookmarks(bookmark_id)')
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

    // Generate description from bio + list name (fire-and-forget; populate inline after insert)
    let description: string | null = null
    try {
      const genRes = await fetch('/api/generate-list-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: profile.bio || '', listName: clean }),
      })
      const genData = await genRes.json()
      description = genData.description
    } catch {
      // Generation failed; just proceed without description
    }

    let { data: list, error } = await supabase
      .from('lists')
      .insert({ user_id: profile.id, name: clean, slug, description })
      .select('id')
      .single()
    if (error && /slug/i.test(error.message || '')) {
      // Migration 009 not applied yet — fall back to a slugless insert.
      const retry = await supabase
        .from('lists')
        .insert({ user_id: profile.id, name: clean, description })
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
  const handleRenameList = async (listId: string, name: string) => {
    const clean = name.trim()
    if (!clean) return
    await supabase.from('lists').update({ name: clean }).eq('id', listId)
    setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name: clean } : l)))
  }

  const handleUpdateDescription = async (listId: string, description: string) => {
    const clean = description.trim()
    await supabase.from('lists').update({ description: clean || null }).eq('id', listId)
    setLists((prev) =>
      prev.map((l) => (l.id === listId ? { ...l, description: clean || null } : l))
    )
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
      // 4 feeds the card's filmstrip. The Figma frame uses 3 tiles for a 1.3x
      // overrun, but tiles keep their own widths: 4 is what still overruns the
      // plate when a list's thumbs happen to all be portrait.
      .slice(0, 4)

  // Order-preserving masonry (round-robin across columns) — a plain CSS-columns
  // flow would fill column-major and scramble the created_at-desc order.
  // Pass ONLY stable, actually-rendered props so React.memo on PrimaryCard holds
  // across search keystrokes (setSelectedId is a stable setter; listName is a
  // stable string), keeping typing smooth as the collection grows.
  const renderBulletGrid = (items: any[]) => (
    <>
      <Masonry>
        {items.slice(0, visibleCount).map((b) => (
          <PrimaryCard
            key={b.id}
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
          />
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
        action={isOwner ? { label: 'Log out', onClick: handleSignOut } : { label: 'Sign in', href: '/login' }}
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
      <div className={`mx-auto ${PROFILE_GRID} pb-40 pt-6 sm:pt-16`}>
        {isOwner && <WelcomeBanner />}

        {/* Hero — centered identity block (name · bio · links · edit). */}
        <div className="mb-8 sm:mb-10">
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
                    const [l1 = '', l2 = ''] = (profile.bio || '').split('\n')
                    setEditBio(l1); setEditBio2(l2)
                    setEditLinks(profile.links || {})
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

          {/* Edit profile form */}
          {editingProfile && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-6 mb-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">line 1</label>
                  <input
                    type="text"
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Venture Designer @ Founders Factory"
                    maxLength={80}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">line 2</label>
                  <input
                    type="text"
                    value={editBio2}
                    onChange={(e) => setEditBio2(e.target.value)}
                    placeholder="Exited Founder of 1-800-D2C"
                    maxLength={80}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">x.com link</label>
                  <input
                    type="url"
                    value={editLinks.twitter || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, twitter: e.target.value })}
                    placeholder="https://x.com/yourname"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">linkedin link</label>
                  <input
                    type="url"
                    value={editLinks.linkedin || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, linkedin: e.target.value })}
                    placeholder="https://linkedin.com/in/yourname"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">website</label>
                  <input
                    type="url"
                    value={editLinks.website || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, website: e.target.value })}
                    placeholder="https://yoursite.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
              </div>
              {profileSaveError && (
                <p className="text-xs text-red-500">{profileSaveError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setEditingProfile(false); setProfileSaveError(null) }}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
                >
                  cancel
                </button>
                <button
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true)
                    setProfileSaveError(null)
                    // Two bio lines → one newline-separated string (drops blanks).
                    const joinedBio = [editBio.trim(), editBio2.trim()].filter(Boolean).join('\n') || null
                    const cleanLinks: any = {}
                    if (editLinks.twitter?.trim()) cleanLinks.twitter = editLinks.twitter.trim()
                    if (editLinks.linkedin?.trim()) cleanLinks.linkedin = editLinks.linkedin.trim()
                    if (editLinks.website?.trim()) cleanLinks.website = editLinks.website.trim()

                    let { error } = await supabase
                      .from('profiles')
                      .update({
                        bio: joinedBio,
                        links: cleanLinks,
                      })
                      .eq('id', profile.id)

                    if (error && /links/i.test(error.message || '')) {
                      const retry = await supabase
                        .from('profiles')
                        .update({ bio: joinedBio })
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

                    setProfile({ ...profile, bio: joinedBio, links: cleanLinks })
                    setEditingProfile(false)
                    setSavingProfile(false)
                  }}
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {savingProfile ? 'saving...' : 'save'}
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Controls — main feed only; hidden inside a list. Tabs sit on the
            right in both views (consistent position). Owner also gets the search
            on the left (justify-between); visitor has tabs alone (justify-end). */}
        {!activeList && (
          <div className={`mb-6 flex items-center gap-4 sm:mb-8 ${isOwner ? 'justify-between' : 'justify-end'}`}>
            {isOwner && (
              <input
                type="search"
                value={query}
                placeholder="Search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-label="Search your links"
                data-1p-ignore
                data-lpignore="true"
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  if (v.trim()) setActiveListId(null)
                  // Any input change supersedes in-flight semantic requests (incl.
                  // clearing — a late response must not repopulate a cleared box).
                  searchSeq.current++
                  // Instant local filter on the keystroke; semantic re-rank lands after.
                  setFiltered(v.trim() ? tokenSearch(v) : bookmarks)
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  if (v.trim()) searchTimer.current = setTimeout(() => handleSearch(v), 250)
                }}
                // Figma: 359x62, 1px #BCBCBC, radius 20, Mier A 600 14/20 #000,
                // 20px inset. 14px is safe here despite iOS Safari's auto-zoom
                // on sub-16px inputs — globals.css already floors every text
                // control at 16px under 640px.
                className="h-[62px] w-full max-w-[359px] rounded-[20px] border border-[#BCBCBC] bg-transparent px-5 font-sans text-[14px] font-[600] leading-5 text-black placeholder:text-black focus:outline-none"
              />
            )}

            {/* View tabs — Figma Group 100667: a single 371x62 container,
                1px #EBEBEB, radius 20, 5px padding; the SELECTED segment is a
                52px-tall #F3F3F3 pill at the same radius. (Was two separate
                #f3f3f3 blocks with corner registration dots.)

                Each tab carries its own glyph rather than the dots marking
                selection: a filled dot for Recent Bullets, and for Lists the
                same three-dot tick used on a card's list line. Hidden while
                searching. */}
            {!query.trim() && (
              <div className="relative flex h-[62px] w-full max-w-[371px] shrink items-center rounded-[20px] border border-[#EBEBEB] p-[5px] sm:shrink-0">
                {/* One pill that slides, rather than a background toggling on
                    each segment. The strip carries 5px of padding, so a segment
                    is calc(50% - 5px) — which is also the pill's own width,
                    hence translateX(100%) lands it exactly on segment two
                    (verified: 975px, the Lists segment's left edge).

                    Easing matches .card-lift's. */}
                <span
                  aria-hidden
                  className="absolute left-[5px] top-[5px] h-[52px] w-[calc(50%-5px)] rounded-[20px] bg-[#F3F3F3] transition-transform duration-[280ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
                  style={{ transform: activeTab === 'lists' ? 'translateX(100%)' : 'translateX(0)' }}
                />
                {([['recent', 'Recent Bullets'], ['lists', 'Lists']] as const).map(([tab, label]) => {
                  const on = activeTab === tab
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`relative z-10 flex h-[52px] min-w-0 flex-1 items-center justify-center gap-[7px] rounded-[20px] font-sans text-[14px] font-[600] leading-5 transition-colors ${
                        on ? 'text-ink' : 'text-black/30 hover:text-black/50'
                      }`}
                    >
                      {tab === 'recent' ? (
                        <span aria-hidden className="h-[7px] w-[7px] shrink-0 rounded-full bg-current" />
                      ) : (
                        <span aria-hidden className="flex shrink-0 flex-col items-center justify-center gap-[2px]">
                          <span className="h-[2px] w-[2px] rounded-full bg-current" />
                          <span className="h-[2px] w-[2px] rounded-full bg-current" />
                          <span className="h-[2px] w-[2px] rounded-full bg-current" />
                        </span>
                      )}
                      <span className="truncate">{label}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
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

        {/* ── Home: RECENT BULLETS grid or LISTS collection grid (tab-gated) ── */}
        {!activeList && !query.trim() && (
          activeTab === 'recent' ? (
            bookmarks.length > 0 ? (
              renderBulletGrid(filtered)
            ) : (
              <div className="py-16 text-center">
                <p className="label text-black/40">No bullets yet</p>
              </div>
            )
          ) : (
            (isOwner || lists.length > 0) ? (
              // Equal columns that fill the width at every breakpoint — a fixed-
              // width auto-fill grid left-packed the cards and left a big empty
              // gap on the right at mid-wide viewports.
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-8 lg:grid-cols-4 lg:gap-x-6 lg:gap-y-10">
                {/* owner: a card-shaped "New list" affordance (also the empty state) */}
                {isOwner && (
                  creatingList ? (
                    <div className="relative flex aspect-[295/393] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[20px] bg-card px-6 shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03]">
                      <input
                        autoFocus
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') {
                            const id = await handleCreateList(newListName)
                            setNewListName(''); setCreatingList(false)
                            if (id) setActiveListId(id)
                          } else if (e.key === 'Escape') {
                            setCreatingList(false); setNewListName('')
                          }
                        }}
                        placeholder="List name"
                        className="label w-full rounded-full border border-black/15 bg-transparent px-4 py-2.5 text-center text-ink placeholder:text-black/40 focus:border-black/40 focus:outline-none"
                      />
                      <div className="flex gap-4">
                        <button
                          onClick={async () => {
                            const id = await handleCreateList(newListName)
                            setNewListName(''); setCreatingList(false)
                            if (id) setActiveListId(id)
                          }}
                          className="label text-ink hover:underline"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setCreatingList(false); setNewListName('') }}
                          className="label text-black/40 transition-colors hover:text-black/60"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingList(true)}
                      className="relative flex aspect-[295/393] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-card text-black/40 shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:text-ink hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current text-xl">+</span>
                      <span className="label">New list</span>
                    </button>
                  )
                )}

                {sortedLists.map((l) => (
                  <CollectionCard
                    key={l.id}
                    name={l.name}
                    count={l.bookmark_ids.length}
                    thumbs={listThumbs(l)}
                    isPrivate={l.is_private}
                    // Clicking a list navigates straight to its own URL — for
                    // the owner too (the list page carries the owner controls).
                    // A slugless list (pre-migration) still falls back to the
                    // in-page view since it has no URL yet.
                    {...(l.slug
                      ? { href: `/${profile.username}/${l.slug}` }
                      : { onClick: () => setActiveListId(l.id) })}
                  />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="label text-black/40">No lists yet</p>
              </div>
            )
          )
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
                  {isOwner && (
                    editingDesc ? (
                      <div className="mt-2">
                        <textarea
                          autoFocus
                          value={descValue}
                          onChange={(e) => setDescValue(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              await handleUpdateDescription(activeList.id, descValue)
                              setEditingDesc(false)
                            } else if (e.key === 'Escape') {
                              setEditingDesc(false)
                            }
                          }}
                          className="w-full bg-transparent border-b border-stone-300 pb-1 text-sm text-stone-600 focus:outline-none focus:border-stone-500 resize-none"
                          rows={2}
                          placeholder="add a description…"
                        />
                        <div className="mt-2 flex gap-3">
                          <button
                            onClick={async () => {
                              await handleUpdateDescription(activeList.id, descValue)
                              setEditingDesc(false)
                            }}
                            className="text-xs uppercase tracking-wider text-ink hover:underline"
                          >
                            save
                          </button>
                          <button
                            onClick={() => setEditingDesc(false)}
                            className="text-xs uppercase tracking-wider text-stone-400 hover:text-ink transition-colors"
                          >
                            cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        {activeList.description ? (
                          <p
                            onClick={() => { setDescValue(activeList.description || ''); setEditingDesc(true) }}
                            className="text-sm text-stone-600 cursor-pointer hover:text-ink transition-colors"
                          >
                            {activeList.description}
                          </p>
                        ) : (
                          <button
                            onClick={() => { setDescValue(''); setEditingDesc(true) }}
                            className="text-xs text-stone-400 hover:text-stone-600 transition-colors"
                          >
                            + add description
                          </button>
                        )}
                      </div>
                    )
                  )}
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
          />
        )
      })()}

      {/* Footer — owner only, reveal-on-scroll-up. The feed is effectively
          endless, so instead of a bottom-anchored footer this is a fixed glassy
          bar that slides in when the user scrolls up (or hits the true end) and
          tucks away while browsing down. */}
      {isOwner && <SiteFooter reveal revealed={footerRevealed} widthClassName={PROFILE_GRID} />}
      {isOwner && <ImportFab hidden={footerRevealed} />}
    </main>
  )
}
