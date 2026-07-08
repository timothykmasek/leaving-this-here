'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { BulletinHeader, BracketLabel } from '@/components/BulletinHeader'
import { CollectionCard } from '@/components/CollectionCard'
import { ProfileIdentity } from '@/components/ProfileIdentity'
import { BulletDetail } from '@/components/BulletDetail'
import { SaveHelp } from '@/components/SaveHelp'
import { WelcomeBanner } from '@/components/WelcomeBanner'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'
import { uniqueSlug } from '@/lib/slug'

// Hybrid: the server component ([username]/page.tsx) fetches profile + bullets +
// lists and passes them in as props, so this island hydrates with content already
// present in the server HTML — no client-side data waterfall, no blank "loading…".
// Same trimmed column set the server renders with — kept in sync so the
// background full-load doesn't reshape rows.
const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, created_at'

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
  // Profile view tab — Recent bullets vs the Lists collection grid.
  const [activeTab, setActiveTab] = useState<'recent' | 'lists'>('recent')
  // Debounce timer for the search — one request per pause, not per keystroke
  // (the embedding API is rate-limited, so per-keystroke calls 429 instantly).
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // Background full-load: the server only SSRs the newest page of bullets for a
  // fast first paint. Once hydrated, pull the complete set so search and list
  // membership cover everything. Non-blocking — the grid is already on screen, so
  // this just extends it with older bullets. We skip updating `filtered` if the
  // user has already started a search, to avoid clobbering their results.
  useEffect(() => {
    if (!mightHaveMore) return
    let cancelled = false
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
    return () => { cancelled = true }
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

  const haystackFor = (b: any) => {
    let host = ''
    try { host = new URL(b.url).hostname.replace(/^www\./, '') } catch {}
    return [b.title, b.description, b.url, host]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  const tokenSearch = (query: string) => {
    const tokens = tokenize(query)
    if (tokens.length === 0) return bookmarks
    const expanded = expandTokens(tokens)
    return bookmarks.filter((b) => {
      const hay = haystackFor(b)
      return expanded.some((t) => hay.includes(t))
    })
  }

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setFiltered(bookmarks); return }
    if (!profile) return

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, user_id: profile.id }),
      })
      if (res.ok) {
        const data = await res.json()
        const ids: string[] = (data.bookmarks || []).map((b: any) => b.id)
        if (ids.length > 0) {
          const byId = new Map(bookmarks.map((b) => [b.id, b]))
          const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[]
          if (ordered.length > 0) {
            setFiltered(ordered)
            return
          }
        }
      }
    } catch {
      // fall through to token search
    }

    setFiltered(tokenSearch(query))
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

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) : null
  const listBullets = activeList
    ? bookmarks.filter((b) => activeList.bookmark_ids.includes(b.id))
    : []

  // bookmark id → the lists it belongs to (for the card chips).
  const listsByBookmark = (() => {
    const m = new Map<string, { id: string; name: string; slug: string | null }[]>()
    for (const l of lists) {
      for (const bid of l.bookmark_ids) {
        const arr = m.get(bid) || []
        arr.push({ id: l.id, name: l.name, slug: l.slug ?? null })
        m.set(bid, arr)
      }
    }
    return m
  })()

  // Up to 4 preview thumbnails for a list card, newest link first (so a small
  // list's single preview shows the latest saved link).
  const bookmarkById = new Map(bookmarks.map((b) => [b.id, b]))
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
      .slice(0, 4)

  // `excludeListId` drops the current list's own chip when rendering inside a
  // list detail view (it'd be redundant there).
  const renderBulletGrid = (items: any[], excludeListId?: string) => (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
      {items.map((b) => (
        <BookmarkCard
          key={b.id}
          id={b.id}
          title={b.title}
          description={b.description}
          url={b.url}
          imageUrl={b.image_url}
          screenshotUrl={b.screenshot_url}
          faviconUrl={b.favicon_url}
          rawMetadata={b.raw_metadata}
          note={b.note}
          isOwner={isOwner}
          cardType={b.card_type}
          inLists={(listsByBookmark.get(b.id) || []).filter((l) => l.id !== excludeListId)}
          ownerUsername={profile.username}
          onDelete={handleDelete}
          onNoteUpdate={handleNoteUpdate}
          onOpen={isOwner ? setSelectedId : undefined}
        />
      ))}
    </div>
  )

  if (!profile) {
    return <main className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div></main>
  }

  // 4 corner rivets — matches the bulletin card chrome.
  const rivets = (
    <>
      <span aria-hidden className="absolute left-[7.4%] top-[7.4%] h-[7px] w-[7px] rounded-full bg-[#d9d9d9]" />
      <span aria-hidden className="absolute right-[7.4%] top-[7.4%] h-[7px] w-[7px] rounded-full bg-[#d9d9d9]" />
      <span aria-hidden className="absolute bottom-[7.4%] left-[7.4%] h-[7px] w-[7px] rounded-full bg-[#d9d9d9]" />
      <span aria-hidden className="absolute bottom-[7.4%] right-[7.4%] h-[7px] w-[7px] rounded-full bg-[#d9d9d9]" />
    </>
  )

  return (
    <main className="min-h-screen bg-paper">
      <BulletinHeader
        action={isOwner ? { label: 'Log out', onClick: handleSignOut } : { label: 'Sign in', href: '/login' }}
        logoClassName="h-[26px] sm:h-[34px]"
      />
      {/* width = exactly a 4-col grid (4×272 + 3×24 gap = 1160) + px-6, so the
          strip's right edge (tabs) lines up with the rightmost card column. */}
      <div className="mx-auto max-w-[1208px] px-4 pb-28 pt-8 sm:px-6 sm:pt-16">
        {isOwner && <WelcomeBanner />}

        {/* Hero — bracket strip + view tabs. `group` enables hover-reveal edit. */}
        <div className="group mb-9">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            {/* bracket strip — name, then bio · link icons · edit, all on one line */}
            <ProfileIdentity
              name={profile.display_name || profile.username}
              bio={profile.bio}
              links={profile.links}
              trailing={
                isOwner && !editingProfile ? (
                  <button
                    onClick={() => { setEditingProfile(true); setEditBio(profile.bio || ''); setEditLinks(profile.links || {}) }}
                    aria-label="Edit profile"
                    title="Edit profile"
                    className="text-black/35 transition-colors hover:text-ink"
                  >
                    <BracketLabel>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="inline-block align-[-1px]">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </BracketLabel>
                  </button>
                ) : null
              }
            />

            {/* right: + Save a bullet + view tabs — all in the bracket-label style */}
            {!activeList && !query.trim() && (
              <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3">
                {isOwner && !editingProfile && (
                  <button
                    onClick={() => setSaveOpen((v) => !v)}
                    className="text-black/40 transition-colors hover:text-ink"
                  >
                    <BracketLabel>+ Save a bullet</BracketLabel>
                  </button>
                )}
                <button
                  onClick={() => setActiveTab('recent')}
                  className={activeTab === 'recent' ? 'text-ink' : 'text-black/35 transition-colors hover:text-black/60'}
                >
                  <BracketLabel>Recent bullets</BracketLabel>
                </button>
                <button
                  onClick={() => setActiveTab('lists')}
                  className={activeTab === 'lists' ? 'text-ink' : 'text-black/35 transition-colors hover:text-black/60'}
                >
                  <BracketLabel>Lists</BracketLabel>
                </button>
              </div>
            )}
          </div>

          {/* Edit profile form */}
          {editingProfile && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-6 mb-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">tagline</label>
                <input
                  type="text"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="a short line about you"
                  maxLength={160}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
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
                    const cleanLinks: any = {}
                    if (editLinks.twitter?.trim()) cleanLinks.twitter = editLinks.twitter.trim()
                    if (editLinks.linkedin?.trim()) cleanLinks.linkedin = editLinks.linkedin.trim()
                    if (editLinks.website?.trim()) cleanLinks.website = editLinks.website.trim()

                    let { error } = await supabase
                      .from('profiles')
                      .update({
                        bio: editBio.trim() || null,
                        links: cleanLinks,
                      })
                      .eq('id', profile.id)

                    if (error && /links/i.test(error.message || '')) {
                      const retry = await supabase
                        .from('profiles')
                        .update({ bio: editBio.trim() || null })
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

                    setProfile({ ...profile, bio: editBio.trim() || null, links: cleanLinks })
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

          {/* Quiet meta row */}
        </div>

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

        {/* Search — owner only: a bracketed SEARCH YOUR LINKS label floating at
            the bottom. The [ ] are literal Routed Gothic Wide glyphs (via the
            `label` class) to match every other bracketed label on the page
            ([ TIM MASEK ], [ EDIT PROFILE ]…) instead of a bespoke bracket. A
            faint paper backdrop keeps it legible where it floats over the grid. */}
        {isOwner && !activeList && !selectedId && (
          <div className="fixed bottom-8 left-1/2 z-40 -translate-x-1/2">
            {/* The input keeps a real 16px font (via !text-base) so iOS Safari
                doesn't auto-zoom on focus — see note below. To still match the
                page's 10px `.label` size visually, scale the whole bar to 0.625
                (=10/16): text renders at 10px while the input stays 16px. */}
            <div
              className="group flex origin-center scale-[0.625] items-center gap-2 rounded-md bg-paper/80 px-3 py-1.5 backdrop-blur-sm"
            >
              {/* left bracket — same glyph + font as the rest of the app's labels */}
              <span
                aria-hidden
                className="label !text-base text-black/40 transition-colors group-focus-within:text-black/60"
              >[</span>
              {/* font-size MUST stay >=16px: iOS Safari auto-zooms the whole page
                  when you focus an input smaller than that. !text-base keeps the
                  label look (uppercase + tracking) but pins the size to 16px so
                  tapping the search field no longer zooms/clips the page on mobile. */}
              <input
                type="text"
                value={query}
                placeholder="Search your links"
                onChange={(e) => {
                  const v = e.target.value
                  setQuery(v)
                  if (v.trim()) setActiveListId(null)
                  // Debounce the network search so we fire once the user pauses,
                  // not on every keystroke. 200ms feels near-instant; embed() now
                  // retries on rate-limit (429) so a short delay can't fail search.
                  if (searchTimer.current) clearTimeout(searchTimer.current)
                  searchTimer.current = setTimeout(() => handleSearch(v), 200)
                }}
                className="label !text-base w-[264px] max-w-[86vw] bg-transparent text-center tracking-[0.15em] text-black/55 placeholder:text-black/45 focus:outline-none"
              />
              {/* right bracket */}
              <span
                aria-hidden
                className="label !text-base text-black/40 transition-colors group-focus-within:text-black/60"
              >]</span>
            </div>
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
                {/* owner: a card-shaped "New list" affordance (also the empty state) */}
                {isOwner && (
                  creatingList ? (
                    <div className="relative flex aspect-[272/270] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-[20px] bg-card px-6 shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03]">
                      {rivets}
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
                      className="relative flex aspect-[272/270] w-full flex-col items-center justify-center gap-3 overflow-hidden rounded-[20px] bg-card text-black/40 shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:text-ink hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
                    >
                      {rivets}
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-current text-xl">+</span>
                      <span className="label">New list</span>
                    </button>
                  )
                )}

                {lists.map((l) => (
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
              renderBulletGrid(listBullets, activeList.id)
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
    </main>
  )
}
