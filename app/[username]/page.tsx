'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { GemDetail } from '@/components/GemDetail'
import { SocialLinks } from '@/components/SocialLinks'
import { SaveHelp } from '@/components/SaveHelp'
import { GemGlyph } from '@/components/GemGlyph'
import { WelcomeBanner } from '@/components/WelcomeBanner'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'
import { uniqueSlug } from '@/lib/slug'

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string
  const supabase = createClient()
  const extInstalled = useExtensionInstalled()

  const [profile, setProfile] = useState<any>(null)
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [newUrl, setNewUrl] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  // Save panel — collapsed by default, auto-opens on empty collections as
  // the onboarding affordance. After the user has any gems, they re-open
  // it manually via the "+ save a gem" pill in the hero.
  const [saveOpen, setSaveOpen] = useState(false)
  const [editingProfile, setEditingProfile] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editLinks, setEditLinks] = useState<any>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  // Which gem's detail modal is open (owner view). Looked up from `bookmarks`
  // so it always reflects the latest tags/note after edits.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Lists. Each: { id, name, is_private, created_at, bookmark_ids: string[] }.
  const [lists, setLists] = useState<any[]>([])
  // Non-empty while the owner is searching — collapses the lists/recent layout
  // down to a flat results grid.
  const [query, setQuery] = useState('')
  const [showAllLists, setShowAllLists] = useState(false)
  const [activeListId, setActiveListId] = useState<string | null>(null)
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
    setExtNudgeDismissed(localStorage.getItem('ig_ext_nudge_dismissed') === '1')
  }, [])
  const dismissExtNudge = () => {
    localStorage.setItem('ig_ext_nudge_dismissed', '1')
    setExtNudgeDismissed(true)
  }

  // Leaving / switching a list closes any in-progress rename.
  useEffect(() => { setRenaming(false) }, [activeListId])

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

      if (error || !prof) { setLoading(false); return }
      setProfile(prof)
      setIsOwner(user?.id === prof.id)

      const { data: bmarks } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', prof.id)
        .order('created_at', { ascending: false })
      setBookmarks(bmarks || [])
      setFiltered(bmarks || [])

      // Lists — best effort; RLS hides others' private lists. If the table
      // doesn't exist yet (migration 008 not applied), just show none.
      setLists(await fetchLists(prof.id))

      // Auto-open the save panel for the owner when the collection is empty
      // — this is the onboarding moment where setup matters most.
      if (user?.id === prof.id && (!bmarks || bmarks.length === 0)) {
        setSaveOpen(true)
      }

      setLoading(false)
    }

    load()
  }, [username, supabase, router])

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl || !profile) return
    setSavingUrl(true)

    try {
      const metaRes = await fetch('/api/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      })
      const meta = await metaRes.json()

      const { data: inserted, error } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url: newUrl,
        title: meta.title || newUrl,
        description: meta.description,
        image_url: meta.image || null,
        // screenshot is captured + persisted server-side after insert
        screenshot_url: null,
        favicon_url: meta.favicon,
        raw_metadata: meta.raw || null,
        tags: [],
      }).select('id').single()

      if (!error) {
        const { data: updated } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
        setBookmarks(updated || [])
        setFiltered(updated || [])
        setNewUrl('')

        if (inserted?.id) {
          fetch('/api/embed-bookmark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inserted.id }),
          }).catch(() => {})

          // Capture + persist the screenshot server-side, then refresh so the
          // new card swaps from its branded fallback to the real image.
          fetch('/api/persist-screenshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inserted.id }),
          })
            .then(async () => {
              const { data: refreshed } = await supabase
                .from('bookmarks')
                .select('*')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
              if (refreshed) {
                setBookmarks(refreshed)
                setFiltered(refreshed)
              }
            })
            .catch(() => {})
        }
      }
    } finally {
      setSavingUrl(false)
    }
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
        .select('id, name, slug, is_private, created_at, list_bookmarks(bookmark_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (!error) return shape(data)
      // Migration 009 (slug column) not applied yet — retry without it so lists
      // still render, just without their public-URL slug.
      if (/slug/i.test(error.message || '')) {
        const fallback = await supabase
          .from('lists')
          .select('id, name, is_private, created_at, list_bookmarks(bookmark_id)')
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
  const listGems = activeList
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

  // Up to 3 preview thumbnails for a list card, from its members' images.
  const bookmarkById = new Map(bookmarks.map((b) => [b.id, b]))
  const listThumbs = (l: any): string[] =>
    (l.bookmark_ids as string[])
      .map((id) => bookmarkById.get(id))
      .filter(Boolean)
      .map((b: any) => b.image_url || b.screenshot_url)
      .filter(Boolean)
      .slice(0, 3)

  // `excludeListId` drops the current list's own chip when rendering inside a
  // list detail view (it'd be redundant there).
  const renderGemGrid = (items: any[], excludeListId?: string) => (
    <div className="grid grid-cols-[repeat(auto-fill,272px)] justify-center gap-x-8 gap-y-12 sm:justify-start">
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

  if (loading) {
    return <main className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div></main>
  }

  if (!profile) {
    return <main className="min-h-screen bg-paper"><div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div></main>
  }

  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
        {isOwner && <WelcomeBanner />}

        {/* Mobile search bar at top — prominent on small screens */}
        {isOwner && (
          <div className="mb-6 md:hidden">
            <input
              type="text"
              value={query}
              placeholder="search your finds…"
              onChange={(e) => {
                const v = e.target.value
                setQuery(v)
                handleSearch(v)
                if (v.trim()) setActiveListId(null)
              }}
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-sm italic text-ink placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>
        )}

        {/* Hero — `group` enables the hover-reveal edit icon below */}
        <div className="mb-6 sm:mb-8 border-b border-gray-100 pb-4 sm:pb-6 group sm:mb-10 sm:pb-8">
          <div className="flex items-start justify-between gap-3 sm:gap-6 mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-xl sm:text-[28px] font-normal tracking-tight text-ink leading-tight mb-2 sm:mb-3">
                {profile.display_name || profile.username}
              </h1>

              {profile.bio && (() => {
                const bioText = profile.bio
                const accordingMatch = bioText.match(/According to [^,]+, life is better with .+$/)
                const mainBio = accordingMatch
                  ? bioText.substring(0, bioText.indexOf('According to')).trim()
                  : bioText
                const accordingLine = accordingMatch ? accordingMatch[0] : null

                return (
                  <>
                    {mainBio && (
                      <p className="mb-3 sm:mb-4 max-w-xl text-xs sm:text-sm leading-relaxed text-stone-500">
                        {mainBio}
                      </p>
                    )}
                    {accordingLine && (
                      <p className="mb-2 sm:mb-3 max-w-xl text-sm sm:text-base leading-relaxed text-stone-700 italic font-serif">
                        "{accordingLine.replace(/^According to /, '').replace(/\.$/, '')}"
                      </p>
                    )}
                  </>
                )
              })()}

              <SocialLinks links={profile.links} />
            </div>

            {isOwner && !editingProfile && (
              <div className="shrink-0 flex flex-col items-center gap-2 sm:flex-row sm:gap-1">
                {/* Mobile: big + button */}
                <button
                  onClick={() => setSaveOpen((v) => !v)}
                  className="relative inline-flex md:hidden w-12 h-12 items-center justify-center text-lg font-bold bg-orange-500 text-white rounded-full hover:bg-orange-600 transition-colors shadow-lg"
                  title="save a find"
                >
                  <span aria-hidden>+</span>
                  {bookmarks.length > 0 && bookmarks.length < 5 && !saveOpen && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
                    </span>
                  )}
                </button>
                {/* Desktop: text pill button */}
                <button
                  onClick={() => setSaveOpen((v) => !v)}
                  className="relative hidden md:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-full text-gray-700 hover:text-gray-900 hover:border-gray-400 transition-colors"
                >
                  <span aria-hidden>+</span> save a find
                  {bookmarks.length > 0 && bookmarks.length < 5 && !saveOpen && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                    </span>
                  )}
                </button>
                {/* Edit-profile pencil — hover-revealed on desktop, persistently
                    faint on mobile (touch has no hover state). */}
                <button
                  onClick={() => { setEditingProfile(true); setEditBio(profile.bio || ''); setEditLinks(profile.links || {}) }}
                  aria-label="edit profile"
                  title="edit profile"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all opacity-40 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
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
          <div className="flex gap-5 text-xs uppercase tracking-wider text-gray-400">
            <span>
              <span className="text-gray-900 font-medium">{bookmarks.length}</span>{' '}
              <span>{bookmarks.length === 1 ? 'find' : 'finds'}</span>
            </span>
            {(() => {
              const latest = bookmarks[0]?.created_at
              if (!latest) return null
              const days = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000)
              const label = days === 0 ? 'updated today' : days === 1 ? 'updated yesterday' : days < 30 ? `updated ${days}d ago` : days < 365 ? `updated ${Math.floor(days / 30)}mo ago` : `updated ${Math.floor(days / 365)}y ago`
              return <span>{label}</span>
            })()}
          </div>
        </div>

        {/* Persistent extension nudge — only for owners on a browser without the
            extension. Dismissible, and hidden while the save panel (which holds
            the actual install steps) is open. */}
        {isOwner && extInstalled === false && !extNudgeDismissed && !saveOpen && (
          <div className="mb-8 flex items-center gap-3 rounded-xl border border-gray-200 bg-white/60 px-4 py-3">
            <GemGlyph className="h-5 w-5 shrink-0 text-ink/40" />
            <p className="flex-1 text-sm text-gray-700">
              Save twice as fast — add the Chrome extension to grab any page in
              one click.
            </p>
            <button
              onClick={() => setSaveOpen(true)}
              className="shrink-0 rounded-full bg-gray-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-gray-800 transition-colors"
            >
              set it up
            </button>
            <button
              onClick={dismissExtNudge}
              aria-label="dismiss"
              className="shrink-0 text-gray-300 hover:text-gray-600 transition-colors"
            >
              ✕
            </button>
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
              <div className="mb-4">
                <h2 className="text-xl font-light text-gray-900 mb-1">save your first find</h2>
                <p className="text-sm text-gray-500">
                  paste any link to get started — articles, videos, products, anything.
                </p>
              </div>
            ) : (
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-3">save a link</p>
            )}

            <form onSubmit={handleSave}>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="paste a link..."
                  autoFocus
                  className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm bg-white"
                />
                <button
                  type="submit"
                  disabled={savingUrl || !newUrl}
                  className="px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm"
                >
                  {savingUrl ? 'saving...' : 'save'}
                </button>
              </div>
            </form>

            {/* Inline save help — extension-first, no separate page. */}
            <SaveHelp extInstalled={extInstalled} />
          </div>
        )}

        {/* Search — desktop version (hidden on mobile, shown above) */}
        {isOwner && (
          <div className="hidden md:block mb-8">
            <input
              type="text"
              value={query}
              placeholder="search your finds…"
              onChange={(e) => {
                const v = e.target.value
                setQuery(v)
                handleSearch(v)
                if (v.trim()) setActiveListId(null)
              }}
              className="w-full bg-transparent border-0 border-b border-stone-300 pb-3 font-serif text-xl sm:text-3xl italic text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-500 transition-colors"
            />
          </div>
        )}

        {/* ── Search results (flat grid) ── */}
        {!activeList && query.trim() && (
          <>
            {filtered.length > 0 ? (
              renderGemGrid(filtered)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">no matches</p>
              </div>
            )}
          </>
        )}

        {/* ── Home: Lists strip + Recent Saves ── */}
        {!activeList && !query.trim() && (
          <>
            {(lists.length > 0 || isOwner) && (
              <section className="mb-12">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="font-serif text-xl font-medium text-ink">Lists</h2>
                  {isOwner && lists.length > 0 && !creatingList && (
                    <button
                      onClick={() => setCreatingList(true)}
                      className="text-sm text-stone-400 hover:text-ink"
                    >
                      + new list
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {/* inline create form */}
                  {isOwner && creatingList && (
                    <div className="flex h-44 flex-col justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white/40 p-4">
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
                        placeholder="list name"
                        className="w-full bg-transparent font-serif text-lg italic text-ink placeholder:text-stone-400 focus:outline-none"
                      />
                      <div className="mt-3 flex gap-3 text-xs">
                        <button
                          onClick={async () => {
                            const id = await handleCreateList(newListName)
                            setNewListName(''); setCreatingList(false)
                            if (id) setActiveListId(id)
                          }}
                          className="font-medium text-ink hover:underline"
                        >
                          create
                        </button>
                        <button
                          onClick={() => { setCreatingList(false); setNewListName('') }}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* zero-state: create your first list */}
                  {isOwner && lists.length === 0 && !creatingList && (
                    <button
                      onClick={() => setCreatingList(true)}
                      className="flex h-44 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600"
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-current text-lg">+</span>
                      <span className="text-sm">Create your first list</span>
                    </button>
                  )}

                  {/* list cards */}
                  {(showAllLists ? lists : lists.slice(0, 3)).map((l) => {
                    const thumbs = listThumbs(l)
                    return (
                      <button
                        key={l.id}
                        onClick={() => setActiveListId(l.id)}
                        className="group flex flex-col rounded-2xl bg-stone-100 p-4 text-left shadow-[0_1px_3px_rgba(40,30,25,0.10)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-[0_6px_20px_rgba(40,30,25,0.14)]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-400">List</span>
                          {l.is_private && (
                            <span className="text-[10px] uppercase tracking-wider text-stone-400">private</span>
                          )}
                        </div>
                        <h3 className="mt-1 line-clamp-1 font-serif text-lg font-medium italic tracking-tight text-ink">
                          {l.name}
                        </h3>
                        <div className="mt-3 flex gap-1.5">
                          {[0, 1, 2].map((i) => (
                            <div key={i} className="h-14 flex-1 overflow-hidden rounded-md bg-stone-100">
                              {thumbs[i] && (
                                <img
                                  src={thumbs[i]}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                                />
                              )}
                            </div>
                          ))}
                        </div>
                        <span className="mt-3 text-xs text-stone-400">
                          {l.bookmark_ids.length} {l.bookmark_ids.length === 1 ? 'link' : 'links'}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {lists.length > 3 && (
                  <button
                    onClick={() => setShowAllLists((v) => !v)}
                    className="mt-4 inline-flex items-center gap-1 rounded-full border border-stone-300 px-3.5 py-1.5 text-sm text-stone-600 transition-colors hover:border-stone-400 hover:text-ink"
                  >
                    {showAllLists ? 'show fewer' : `+ ${lists.length - 3} more lists`}
                    <span aria-hidden>{showAllLists ? '▴' : '▾'}</span>
                  </button>
                )}
              </section>
            )}

            <section>
              <h2 className="mb-4 font-serif text-xl italic text-ink">Recent Saves</h2>
              {bookmarks.length > 0 ? (
                renderGemGrid(filtered)
              ) : (
                <div className="text-center py-16">
                  <p className="text-gray-500 text-sm">no finds yet</p>
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
                    <span>{listGems.length} {listGems.length === 1 ? 'find' : 'finds'}</span>
                    {activeList.slug && (
                      <a
                        href={`/${profile.username}/${activeList.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="normal-case tracking-normal text-stone-400 hover:text-ink"
                      >
                        view public page ↗
                      </a>
                    )}
                  </div>
                  {isOwner && (
                    editingDesc ? (
                      <textarea
                        autoFocus
                        value={descValue}
                        onChange={(e) => setDescValue(e.target.value)}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.ctrlKey) {
                            await handleUpdateDescription(activeList.id, descValue)
                            setEditingDesc(false)
                          } else if (e.key === 'Escape') {
                            setEditingDesc(false)
                          }
                        }}
                        onBlur={async () => {
                          await handleUpdateDescription(activeList.id, descValue)
                          setEditingDesc(false)
                        }}
                        className="mt-2 w-full bg-transparent border-b border-stone-300 pb-1 text-sm text-stone-600 focus:outline-none focus:border-stone-500 resize-none"
                        rows={2}
                        placeholder="add a description…"
                      />
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
            {listGems.length > 0 ? (
              renderGemGrid(listGems, activeList.id)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">
                  empty list{isOwner ? ' — open a find and add it to this list' : ''}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Gem detail modal — owner view, opened by clicking a card */}
      {isOwner && selectedId && (() => {
        const gem = bookmarks.find((b) => b.id === selectedId)
        if (!gem) return null
        return (
          <GemDetail
            gem={gem}
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
