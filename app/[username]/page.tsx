'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { GemDetail } from '@/components/GemDetail'
import { SocialLinks } from '@/components/SocialLinks'
import { SaveHelp } from '@/components/SaveHelp'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'

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
  const [view, setView] = useState<'recent' | 'lists'>('recent')
  const [activeListId, setActiveListId] = useState<string | null>(null)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  // Extension install nudge — dismissible, persisted so we only ask once.
  const [extNudgeDismissed, setExtNudgeDismissed] = useState(true)
  useEffect(() => {
    setExtNudgeDismissed(localStorage.getItem('ig_ext_nudge_dismissed') === '1')
  }, [])
  const dismissExtNudge = () => {
    localStorage.setItem('ig_ext_nudge_dismissed', '1')
    setExtNudgeDismissed(true)
  }

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
    return [b.title, b.description, b.url, host, ...(b.tags || [])]
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

  const handleTagsUpdate = async (id: string, newTags: string[]) => {
    await supabase.from('bookmarks').update({ tags: newTags }).eq('id', id)
    const update = (list: any[]) => list.map((b) => b.id === id ? { ...b, tags: newTags } : b)
    setBookmarks(update)
    setFiltered(update)
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
    try {
      const { data, error } = await supabase
        .from('lists')
        .select('id, name, is_private, created_at, list_bookmarks(bookmark_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (error) return []
      return (data || []).map((l: any) => ({
        ...l,
        bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
      }))
    } catch {
      return []
    }
  }

  const handleCreateList = async (name: string, bookmarkIds: string[] = []) => {
    const clean = name.trim()
    if (!clean || !profile) return null
    const { data: list, error } = await supabase
      .from('lists')
      .insert({ user_id: profile.id, name: clean })
      .select('id')
      .single()
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

  // Collect all tags (still needed for tag-editor suggestions on owner cards).
  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags || []))).sort()

  // Tag-based list suggestion: the most-used tag (≥3 gems) that isn't already
  // a list — the "N saves tagged X. Make them a list →" nudge.
  const listSuggestion = (() => {
    if (!isOwner) return null
    const names = new Set(lists.map((l) => l.name.toLowerCase()))
    const counts: Record<string, number> = {}
    bookmarks.forEach((b) => (b.tags || []).forEach((t: string) => { counts[t] = (counts[t] || 0) + 1 }))
    const top = Object.entries(counts)
      .filter(([tag, c]) => c >= 3 && !names.has(tag.toLowerCase()))
      .sort((a, b) => b[1] - a[1])[0]
    return top ? { tag: top[0], count: top[1] } : null
  })()

  const activeList = activeListId ? lists.find((l) => l.id === activeListId) : null
  const listGems = activeList
    ? bookmarks.filter((b) => activeList.bookmark_ids.includes(b.id))
    : []

  const renderGemGrid = (items: any[]) => (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3">
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
          tags={b.tags || []}
          allTags={allTags}
          note={b.note}
          isOwner={isOwner}
          cardType={b.card_type}
          onDelete={handleDelete}
          onTagsUpdate={handleTagsUpdate}
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
        {/* Hero — `group` enables the hover-reveal edit icon below */}
        <div className="mb-8 border-b border-gray-100 pb-6 group sm:mb-10 sm:pb-8">
          <div className="flex items-start justify-between gap-6 mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="font-serif text-2xl sm:text-[28px] font-normal tracking-tight text-ink leading-tight mb-3">
                {profile.display_name || profile.username}
              </h1>

              <SocialLinks links={profile.links} />
            </div>

            {isOwner && !editingProfile && (
              <div className="shrink-0 flex items-center gap-1">
                <button
                  onClick={() => setSaveOpen((v) => !v)}
                  className="relative inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border border-gray-200 rounded-full text-gray-700 hover:text-gray-900 hover:border-gray-400 transition-colors"
                >
                  <span aria-hidden>+</span> save a gem
                  {/* Quiet pulse for early-stage users who haven't installed the
                      bookmarklet yet — fades out once they have ≥ 5 gems. */}
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
              <span>{bookmarks.length === 1 ? 'gem' : 'gems'}</span>
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
            <span aria-hidden className="text-lg">💎</span>
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
                <h2 className="text-xl font-light text-gray-900 mb-1">save your first gem 💎</h2>
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

        {/* Search — sits above the tabs so it scopes the whole collection. */}
        {isOwner && (
          <div className="mb-8">
            <input
              type="text"
              placeholder="search your gems…"
              onChange={(e) => {
                handleSearch(e.target.value)
                // Results render in the Recent grid, so a query snaps there.
                if (e.target.value.trim()) { setView('recent'); setActiveListId(null) }
              }}
              className="w-full bg-transparent border-0 border-b border-stone-300 pb-3 font-serif text-xl sm:text-3xl italic text-ink placeholder:text-stone-400 focus:outline-none focus:border-stone-500 transition-colors"
            />
          </div>
        )}

        {/* Tabs: Recent / Lists */}
        {(isOwner || lists.length > 0) && (
          <div className="mb-8 flex items-center gap-7 border-b border-stone-300/60">
            {(['recent', 'lists'] as const).map((v) => (
              <button
                key={v}
                onClick={() => { setView(v); setActiveListId(null) }}
                className={`-mb-px border-b-2 pb-3 font-serif text-xl italic transition-colors ${
                  view === v ? 'border-ink text-ink' : 'border-transparent text-stone-400 hover:text-stone-600'
                }`}
              >
                {v === 'recent' ? 'Recent' : 'Lists'}
              </button>
            ))}
          </div>
        )}

        {/* ── Recent ── */}
        {view === 'recent' && (
          <>
            {filtered.length > 0 ? (
              renderGemGrid(filtered)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">
                  {bookmarks.length === 0 ? 'no gems yet 💎' : 'no matches'}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Lists overview ── */}
        {view === 'lists' && !activeList && (
          <>
            {listSuggestion && (
              <button
                onClick={async () => {
                  const ids = bookmarks
                    .filter((b) => (b.tags || []).includes(listSuggestion.tag))
                    .map((b) => b.id)
                  const id = await handleCreateList(listSuggestion.tag, ids)
                  if (id) setActiveListId(id)
                }}
                className="mb-8 flex w-full items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/50 px-5 py-4 text-left transition-colors hover:border-stone-400 hover:bg-white"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-paper">+</span>
                <span className="text-sm text-stone-700">
                  <strong className="font-medium text-ink">{listSuggestion.count} saves</strong> are tagged{' '}
                  <strong className="font-medium text-ink">{listSuggestion.tag}</strong>. Make them a list →
                </span>
              </button>
            )}

            {lists.length > 0 || isOwner ? (
              <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
                {lists.map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setActiveListId(l.id)}
                    className="flex h-48 flex-col items-center justify-center rounded-2xl bg-white px-4 text-center shadow-[0_1px_3px_rgba(40,30,25,0.10)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-[0_6px_20px_rgba(40,30,25,0.14)]"
                  >
                    <h3 className="line-clamp-3 font-serif text-lg font-medium italic leading-snug tracking-tight text-ink">
                      {l.name}
                    </h3>
                    <span className="mt-4 font-serif text-2xl text-stone-400">{l.bookmark_ids.length}</span>
                    {l.is_private && (
                      <span className="mt-2 text-[10px] uppercase tracking-wider text-stone-400">private</span>
                    )}
                  </button>
                ))}

                {isOwner && (creatingList ? (
                  <div className="flex h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 bg-white/40 px-4">
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
                      className="w-full bg-transparent text-center font-serif text-lg italic text-ink placeholder:text-stone-400 focus:outline-none"
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
                ) : (
                  <button
                    onClick={() => setCreatingList(true)}
                    className="flex h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-600"
                  >
                    <span className="text-2xl">+</span>
                    <span className="mt-2 text-sm">new list</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">no lists yet</p>
              </div>
            )}
          </>
        )}

        {/* ── List detail ── */}
        {view === 'lists' && activeList && (
          <>
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex items-baseline gap-3 min-w-0">
                <button
                  onClick={() => setActiveListId(null)}
                  className="shrink-0 text-sm text-stone-400 hover:text-ink"
                >
                  ← lists
                </button>
                <h2 className="truncate font-serif text-2xl font-normal italic tracking-tight text-ink">
                  {activeList.name}
                </h2>
                <span className="shrink-0 text-xs uppercase tracking-wider text-stone-400">
                  {listGems.length} {listGems.length === 1 ? 'gem' : 'gems'}
                </span>
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
            {listGems.length > 0 ? (
              renderGemGrid(listGems)
            ) : (
              <div className="text-center py-16">
                <p className="text-gray-500 text-sm">
                  empty list{isOwner ? ' — open a gem and add it to this list' : ''}
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
            allTags={allTags}
            lists={lists}
            onClose={() => setSelectedId(null)}
            onTagsUpdate={handleTagsUpdate}
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
