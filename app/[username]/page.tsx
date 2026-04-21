'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import Link from 'next/link'

export default function ProfilePage() {
  const params = useParams()
  const router = useRouter()
  const username = params.username as string
  const supabase = createClient()

  const [profile, setProfile] = useState<any>(null)
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [filtered, setFiltered] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [isFollowing, setIsFollowing] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [newUrl, setNewUrl] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [editingProfile, setEditingProfile] = useState(false)
  const [editBio, setEditBio] = useState('')
  const [editLinks, setEditLinks] = useState<any>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [reembedding, setReembedding] = useState(false)
  const [reembedMsg, setReembedMsg] = useState<string | null>(null)

  // Subscribe modal — stub in Phase 1, wired up in Phase 2 (folio_subscribers + Resend).
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [subscribeEmail, setSubscribeEmail] = useState('')
  const [subscribeDone, setSubscribeDone] = useState(false)

  const handleDownloadCSV = () => {
    const rows = bookmarks.map((b) => b.url)
    const csv = rows.join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${username}-links.csv`
    a.click()
  }

  const handleUploadCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !profile) return
    setUploading(true)
    setUploadMsg(null)

    try {
      const text = await file.text()
      const urls = text
        .split(/[\r\n]+/)
        .map((line) => line.trim().replace(/^["']|["']$/g, ''))
        .filter((line) => line && (line.startsWith('http://') || line.startsWith('https://')))

      if (urls.length === 0) {
        setUploadMsg('no valid URLs found — make sure each row is a full link starting with http')
        return
      }

      let added = 0
      for (const linkUrl of urls) {
        try {
          const { error } = await supabase.from('bookmarks').insert({
            user_id: profile.id,
            url: linkUrl,
            title: linkUrl,
            tags: [],
          })
          if (!error) added++
        } catch (e) {}
      }

      // Refresh bookmarks
      const { data: updated } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
      setBookmarks(updated || [])
      setFiltered(updated || [])
      setUploadMsg(`imported ${added} of ${urls.length} links`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // Backfill embeddings for any of the owner's bookmarks that don't have one yet.
  // Idempotent — the API only touches rows where embedding is null.
  const handleReembedAll = async () => {
    setReembedding(true)
    setReembedMsg('embedding...')
    try {
      const res = await fetch('/api/backfill-embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setReembedMsg(`error: ${data.error || 'unknown'}`)
      } else if (data.processed === 0) {
        setReembedMsg('nothing to embed')
      } else {
        setReembedMsg(`embedded ${data.processed}${data.errors ? ` (${data.errors} errors)` : ''}`)
      }
    } catch (err: any) {
      setReembedMsg(`error: ${err.message || 'unknown'}`)
    } finally {
      setReembedding(false)
      setTimeout(() => setReembedMsg(null), 4000)
    }
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUserId(user?.id || null)

      // Get profile
      const { data: prof, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single()

      if (error || !prof) { setLoading(false); return }
      setProfile(prof)
      setIsOwner(user?.id === prof.id)

      // Get bookmarks
      let query = supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', prof.id)
        .order('created_at', { ascending: false })

      // Non-owners only see public bookmarks
      if (user?.id !== prof.id) {
        query = query.eq('is_private', false)
      }

      const { data: bmarks } = await query
      setBookmarks(bmarks || [])
      setFiltered(bmarks || [])

      // Counts
      const { count: followerCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', prof.id)
      setFollowers(followerCount || 0)

      const { count: followingCount } = await supabase
        .from('follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', prof.id)
      setFollowing(followingCount || 0)

      // Check if following
      if (user && user.id !== prof.id) {
        const { data: f } = await supabase
          .from('follows')
          .select('follower_id')
          .eq('follower_id', user.id)
          .eq('following_id', prof.id)
          .single()
        setIsFollowing(!!f)
      }

      setLoading(false)
    }

    load()
  }, [username, supabase, router])

  // Lightweight semantic-ish search so it isn't purely literal.
  // Maps a query token to related terms we'll also accept as a match.
  // (A real embedding-based search will replace this — this is the
  // pragmatic fix that makes "can" find beverage bookmarks today.)
  const SYNONYMS: Record<string, string[]> = {
    can: ['beverage', 'drink', 'soda', 'water', 'cola', 'aluminum'],
    drink: ['beverage', 'can', 'soda', 'water'],
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

  const applyTagFilter = (list: any[], tags: string[]) => {
    if (tags.length === 0) return list
    return list.filter((b) => tags.every((t) => b.tags?.includes(t)))
  }

  // Token + synonym fallback — used when semantic search is unavailable
  // or returns nothing.
  const tokenSearch = (query: string) => {
    const tokens = tokenize(query)
    if (tokens.length === 0) return applyTagFilter(bookmarks, selectedTags)
    const expanded = expandTokens(tokens)
    const base = applyTagFilter(bookmarks, selectedTags)
    return base.filter((b) => {
      const hay = haystackFor(b)
      return expanded.some((t) => hay.includes(t))
    })
  }

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setFiltered(applyTagFilter(bookmarks, selectedTags)); return }
    if (!profile) return

    // Try real semantic search first (Voyage + pgvector)
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
          // Reorder existing client-side bookmarks so we keep the full
          // BookmarkCard props without refetching.
          const byId = new Map(bookmarks.map((b) => [b.id, b]))
          const ordered = ids.map((id) => byId.get(id)).filter(Boolean) as any[]
          const filteredByTag = applyTagFilter(ordered, selectedTags)
          if (filteredByTag.length > 0) {
            setFiltered(filteredByTag)
            return
          }
        }
      }
    } catch {
      // fall through to token search
    }

    // Fallback: token + synonym search
    setFiltered(tokenSearch(query))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl || !profile) return
    setSavingUrl(true)

    try {
      // Fetch metadata from our own API (no third-party rate limits)
      const metaRes = await fetch('/api/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: newUrl }),
      })
      const meta = await metaRes.json()

      // Generate screenshot URL for landing pages / fallback
      const ssUrl = `https://api.screenshotone.com/take?access_key=C3xT-xTVEXsWww&url=${encodeURIComponent(newUrl)}&viewport_width=1280&viewport_height=900&format=webp&image_quality=90&block_ads=true&block_cookie_banners=true&block_chats=true&delay=2&cache=true&cache_ttl=86400`

      const { data: inserted, error } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url: newUrl,
        title: meta.title || newUrl,
        description: meta.description,
        image_url: meta.image || null,
        screenshot_url: ssUrl,
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

        // Generate embedding in the background (non-fatal)
        if (inserted?.id) {
          fetch('/api/embed-bookmark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: inserted.id }),
          }).catch(() => {})
        }
      }
    } finally {
      setSavingUrl(false)
    }
  }

  const handleFollow = async () => {
    if (!currentUserId || !profile) { router.push('/login'); return }

    if (isFollowing) {
      await supabase.from('follows').delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', profile.id)
      setFollowers((f) => f - 1)
    } else {
      await supabase.from('follows').insert({
        follower_id: currentUserId,
        following_id: profile.id,
      })
      setFollowers((f) => f + 1)
    }
    setIsFollowing(!isFollowing)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    setBookmarks((prev) => prev.filter((b) => b.id !== id))
    setFiltered((prev) => prev.filter((b) => b.id !== id))
  }

  const handlePrivacyToggle = async (id: string, newPrivate: boolean) => {
    await supabase.from('bookmarks').update({ is_private: newPrivate }).eq('id', id)
    const update = (list: any[]) => list.map((b) => b.id === id ? { ...b, is_private: newPrivate } : b)
    setBookmarks(update)
    setFiltered(update)
  }

  const handleTagsUpdate = async (id: string, newTags: string[]) => {
    await supabase.from('bookmarks').update({ tags: newTags }).eq('id', id)
    const update = (list: any[]) => list.map((b) => b.id === id ? { ...b, tags: newTags } : b)
    setBookmarks(update)
    setFiltered(update)
  }

  const handleNoteUpdate = async (id: string, newNote: string | null) => {
    // Graceful fallback: if migration 005 hasn't been applied yet, the update
    // errors with "column note does not exist". Keep the optimistic UI state
    // so the owner sees their note locally, and surface a quiet console warning.
    const { error } = await supabase.from('bookmarks').update({ note: newNote }).eq('id', id)
    if (error && /note/i.test(error.message || '')) {
      console.warn('bookmarks.note column missing — apply migrations/005_bookmarks_note.sql in the Supabase SQL editor')
    }
    const update = (list: any[]) => list.map((b) => b.id === id ? { ...b, note: newNote } : b)
    setBookmarks(update)
    setFiltered(update)
  }

  // Get all tags
  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags || []))).sort()

  // Single-select: clicking a tag selects only it; clicking the active tag clears it.
  const handleTagToggle = (tag: string) => {
    const next = selectedTags[0] === tag ? [] : [tag]
    setSelectedTags(next)
    setFiltered(applyTagFilter(bookmarks, next))
  }

  if (loading) {
    return <main className="min-h-screen bg-white"><div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div></main>
  }

  if (!profile) {
    return <main className="min-h-screen bg-white"><div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div></main>
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Folio hero */}
        <div className="mb-12 border-b border-gray-100 pb-10">
          <div className="flex items-start justify-between gap-6 mb-6">
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-gray-900 mb-4 leading-[1.1]">
                {profile.display_name || profile.username}
              </h1>
              {profile.bio && (
                <p className="text-gray-600 italic text-lg leading-relaxed max-w-2xl mb-4">
                  {profile.bio}
                </p>
              )}
              {!profile.bio && isOwner && !editingProfile && (
                <p
                  className="text-gray-300 text-base mb-4 italic cursor-pointer hover:text-gray-400"
                  onClick={() => { setEditingProfile(true); setEditBio(''); setEditLinks(profile.links || {}) }}
                >
                  add a short tagline...
                </p>
              )}

              {/* Social links */}
              {profile.links && Object.keys(profile.links).length > 0 && (
                <div className="flex gap-4 flex-wrap">
                  {profile.links.twitter && (
                    <a href={`https://x.com/${profile.links.twitter}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">x.com/{profile.links.twitter}</a>
                  )}
                  {profile.links.linkedin && (
                    <a href={`https://linkedin.com/in/${profile.links.linkedin}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">linkedin.com/in/{profile.links.linkedin}</a>
                  )}
                  {profile.links.website && (
                    <a href={profile.links.website.startsWith('http') ? profile.links.website : `https://${profile.links.website}`} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">{profile.links.website.replace(/^https?:\/\//, '')}</a>
                  )}
                </div>
              )}
            </div>

            {/* Actions — subscribe is the primary CTA, follow is demoted secondary */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              {!isOwner && (
                <button
                  onClick={() => { setSubscribeOpen(true); setSubscribeDone(false); setSubscribeEmail('') }}
                  className="px-6 py-2.5 bg-gray-900 text-white rounded-full font-medium text-sm hover:bg-gray-800 transition-colors shadow-sm"
                >
                  subscribe
                </button>
              )}
              {currentUserId && !isOwner && (
                <button
                  onClick={handleFollow}
                  className="text-xs text-gray-400 hover:text-gray-700 transition-colors"
                >
                  {isFollowing ? 'following' : 'follow'}
                </button>
              )}
              {isOwner && !editingProfile && (
                <button
                  onClick={() => { setEditingProfile(true); setEditBio(profile.bio || ''); setEditLinks(profile.links || {}) }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
                >
                  edit profile
                </button>
              )}
            </div>
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
                  placeholder="the short line that describes your folio"
                  maxLength={160}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">x.com handle</label>
                  <input
                    type="text"
                    value={editLinks.twitter || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, twitter: e.target.value.replace('@', '') })}
                    placeholder="handle"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">linkedin</label>
                  <input
                    type="text"
                    value={editLinks.linkedin || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, linkedin: e.target.value })}
                    placeholder="username"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">website</label>
                  <input
                    type="text"
                    value={editLinks.website || ''}
                    onChange={(e) => setEditLinks({ ...editLinks, website: e.target.value })}
                    placeholder="yoursite.com"
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

                    // Try saving bio + links together first.
                    let { error } = await supabase
                      .from('profiles')
                      .update({
                        bio: editBio.trim() || null,
                        links: cleanLinks,
                      })
                      .eq('id', profile.id)

                    // Graceful fallback: if the `links` column doesn't exist
                    // yet (migration 003 not applied), still save the bio so
                    // the user never sees a silent failure.
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

          {/* Quiet meta row — folio stats live here, de-emphasized */}
          <div className="flex gap-5 text-xs uppercase tracking-wider text-gray-400">
            <span>
              <span className="text-gray-900 font-medium">{bookmarks.length}</span>{' '}
              <span>links</span>
            </span>
            {(() => {
              const latest = bookmarks[0]?.created_at
              if (!latest) return null
              const days = Math.floor((Date.now() - new Date(latest).getTime()) / 86400000)
              const label = days === 0 ? 'updated today' : days === 1 ? 'updated yesterday' : days < 30 ? `updated ${days}d ago` : days < 365 ? `updated ${Math.floor(days / 30)}mo ago` : `updated ${Math.floor(days / 365)}y ago`
              return <span>{label}</span>
            })()}
            <Link href={`/${username}/followers`} className="hover:text-gray-700 transition-colors">
              <span className="text-gray-900 font-medium">{followers}</span>{' '}
              <span>followers</span>
            </Link>
            <Link href={`/${username}/following`} className="hover:text-gray-700 transition-colors">
              <span className="text-gray-900 font-medium">{following}</span>{' '}
              <span>following</span>
            </Link>
          </div>
        </div>

        {/* Save input (owner only) */}
        {isOwner && (
          <form onSubmit={handleSave} className="mb-6">
            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="paste a link..."
                className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
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
        )}

        {/* Search experience — larger, more inviting */}
        <div className="mb-8 space-y-5">
          <div className="relative">
            <input
              type="text"
              placeholder="search your links..."
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full px-6 py-4 text-lg font-light italic text-gray-700 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-gray-400 bg-gray-50/50 placeholder:text-gray-400"
            />
          </div>

          {allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                    selectedTags[0] === tag
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Owner-only utilities: save-from-anywhere, CSV import/export */}
          {isOwner && (
            <div className="flex items-center gap-5 pt-1 flex-wrap">
              <Link
                href="/bookmarklet"
                className="text-xs text-gray-500 hover:text-gray-900 transition-colors underline-offset-4 hover:underline"
              >
                + add the “save a link” button to your browser
              </Link>
              <span className="text-gray-200">·</span>
              <button
                onClick={handleDownloadCSV}
                disabled={bookmarks.length === 0}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30"
              >
                download links as csv
              </button>
              <label className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
                {uploading ? 'importing...' : 'import from csv'}
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleUploadCSV}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              {uploadMsg && <span className="text-xs text-gray-500">{uploadMsg}</span>}
            </div>
          )}
        </div>

        {/* Bookmark grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((b) => (
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
                isPrivate={b.is_private}
                cardType={b.card_type}
                onDelete={handleDelete}
                onPrivacyToggle={handlePrivacyToggle}
                onTagsUpdate={handleTagsUpdate}
                onNoteUpdate={handleNoteUpdate}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">
              {bookmarks.length === 0 ? 'no links yet' : 'no matches'}
            </p>
          </div>
        )}
      </div>

      {/* Subscribe modal — Phase 1 stub. Stores to localStorage so we can demo
          the flow end-to-end. Phase 2 swaps this for a real POST to
          /api/folio-subscribers that writes to Supabase + triggers double opt-in. */}
      {subscribeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setSubscribeOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8"
            onClick={(e) => e.stopPropagation()}
          >
            {!subscribeDone ? (
              <>
                <h2 className="text-2xl font-light text-gray-900 mb-2">
                  Subscribe to {profile.display_name || profile.username}
                </h2>
                <p className="text-sm text-gray-500 leading-relaxed mb-6">
                  You&apos;ll get a digest when {profile.display_name || profile.username} saves
                  10 new links — or once a month, whichever comes first.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!subscribeEmail.trim()) return
                    // Phase 1 stub — store locally so the flow is demo-able end-to-end.
                    // Phase 2 will replace with a real API call + double opt-in email.
                    try {
                      const key = `folio_subscribers:${profile.id}`
                      const existing = JSON.parse(localStorage.getItem(key) || '[]')
                      existing.push({
                        email: subscribeEmail.trim(),
                        created_at: new Date().toISOString(),
                      })
                      localStorage.setItem(key, JSON.stringify(existing))
                    } catch {}
                    setSubscribeDone(true)
                  }}
                  className="space-y-4"
                >
                  <input
                    type="email"
                    required
                    value={subscribeEmail}
                    onChange={(e) => setSubscribeEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                  />
                  <div className="flex gap-2 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setSubscribeOpen(false)}
                      className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
                    >
                      cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800"
                    >
                      subscribe
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-light text-gray-900 mb-2">You&apos;re in.</h2>
                <p className="text-sm text-gray-500 leading-relaxed mb-6">
                  We&apos;ll send you {profile.display_name || profile.username}&apos;s first
                  digest when they hit 10 new links — or once a month, whichever comes first.
                </p>
                <div className="flex justify-end">
                  <button
                    onClick={() => setSubscribeOpen(false)}
                    className="px-5 py-2 bg-gray-900 text-white rounded-full text-sm font-medium hover:bg-gray-800"
                  >
                    done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
