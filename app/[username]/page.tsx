'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { SearchBar } from '@/components/SearchBar'
import Link from 'next/link'

// Token-based search with synonym expansion — a deliberate stopgap before
// real embeddings. Lets queries like "can" find "sexywater" (beverage brand).
const SYNONYMS: Record<string, string[]> = {
  can: ['beverage', 'drink', 'soda', 'water', 'canned', 'bottle'],
  drink: ['beverage', 'can', 'soda', 'water', 'cocktail'],
  beverage: ['drink', 'can', 'soda', 'water'],
  water: ['drink', 'beverage', 'can', 'hydration'],
  food: ['recipe', 'cooking', 'meal', 'kitchen', 'restaurant'],
  recipe: ['food', 'cooking', 'meal'],
  car: ['vehicle', 'auto', 'automobile', 'driving'],
  clothes: ['fashion', 'apparel', 'clothing', 'style', 'outfit'],
  fashion: ['clothes', 'apparel', 'clothing', 'style'],
  home: ['house', 'interior', 'decor', 'furniture'],
  house: ['home', 'interior', 'decor'],
  design: ['ui', 'ux', 'graphic', 'typography', 'visual'],
  tech: ['technology', 'software', 'hardware', 'gadget'],
  ai: ['ml', 'artificial intelligence', 'machine learning', 'llm'],
  money: ['finance', 'crypto', 'investing', 'bank'],
  travel: ['trip', 'vacation', 'flight', 'hotel'],
}

function expandTokens(query: string): string[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  const expanded = new Set<string>(tokens)
  for (const t of tokens) {
    if (SYNONYMS[t]) {
      for (const s of SYNONYMS[t]) expanded.add(s)
    }
    // reverse lookup — if the token appears in a synonym list, add the key and siblings
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (syns.includes(t)) {
        expanded.add(key)
        for (const s of syns) expanded.add(s)
      }
    }
  }
  return Array.from(expanded)
}

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
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editLinks, setEditLinks] = useState<any>({})
  const [savingProfile, setSavingProfile] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importText, setImportText] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [retagging, setRetagging] = useState(false)
  const [reembedding, setReembedding] = useState(false)
  const [reembedStatus, setReembedStatus] = useState<string | null>(null)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)

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

  // Token-based fallback: hostname + synonym-expanded token matching.
  // Used when semantic search is unavailable or returns nothing.
  const tokenSearch = (query: string): any[] => {
    const tokens = expandTokens(query)
    return bookmarks.filter((b) => {
      let host = ''
      try { host = new URL(b.url).hostname } catch {}
      const haystack = [b.title, b.description, b.url, host, ...(b.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return tokens.some((t) => haystack.includes(t))
    })
  }

  const handleSearch = async (query: string) => {
    if (!query.trim()) { setFiltered(bookmarks); return }
    if (!profile) return

    // Try semantic search first
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
          // Reorder the bookmarks we already have client-side so rendering
          // uses the same BookmarkCard props without refetching.
          const byId = new Map(bookmarks.map((b) => [b.id, b]))
          const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
          if (ordered.length > 0) {
            setFiltered(ordered as any[])
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

  // AI-powered tag generation — sends title + description to Claude Haiku
  const generateTags = async (url: string, title: string | null, description: string | null): Promise<string[]> => {
    try {
      const res = await fetch('/api/generate-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, title, description }),
      })
      const data = await res.json()
      return data.tags || []
    } catch {
      return []
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl || !profile) return
    setSavingUrl(true)

    try {
      // Save immediately with just the URL — feels instant
      const { data: inserted, error } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url: newUrl,
        title: newUrl,
        tags: [],
      }).select().single()

      if (error || !inserted) { setSavingUrl(false); return }

      // Show the card right away
      const tempBookmark = inserted
      setBookmarks(prev => [tempBookmark, ...prev])
      setFiltered(prev => [tempBookmark, ...prev])
      setNewUrl('')
      setSavingUrl(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)

      // Fetch metadata + AI tags in the background, then update
      ;(async () => {
        try {
          const metaRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(tempBookmark.url)}`)
          const meta = await metaRes.json()

          const autoTags = await generateTags(
            tempBookmark.url,
            meta.data?.title,
            meta.data?.description
          )
          const updates = {
            title: meta.data?.title || tempBookmark.url,
            description: meta.data?.description || null,
            image_url: meta.data?.image?.url || null,
            favicon_url: meta.data?.logo?.url || null,
            tags: autoTags,
          }
          await supabase.from('bookmarks').update(updates).eq('id', tempBookmark.id)

          // Update local state with the enriched data
          const enriched = { ...tempBookmark, ...updates }
          setBookmarks(prev => prev.map(b => b.id === tempBookmark.id ? enriched : b))
          setFiltered(prev => prev.map(b => b.id === tempBookmark.id ? enriched : b))

          // Generate embedding for semantic search (non-fatal if it fails)
          fetch('/api/embed-bookmark', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: tempBookmark.id }),
          }).catch(() => {})
        } catch {}
      })()
    } catch {
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

  const handleExport = () => {
    const data = bookmarks.map(b => ({
      url: b.url,
      title: b.title,
      tags: b.tags || [],
      saved: b.created_at,
    }))
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${username}-links.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async () => {
    if (!importText.trim() || !profile) return
    setImporting(true)
    const urls = importText.split('\n').map(l => l.trim()).filter(l => l && (l.startsWith('http://') || l.startsWith('https://')))
    const existing = new Set(bookmarks.map(b => b.url))

    for (const url of urls) {
      if (existing.has(url)) continue
      try {
        const metaRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}`)
        const meta = await metaRes.json()
        await supabase.from('bookmarks').insert({
          user_id: profile.id,
          url,
          title: meta.data?.title || url,
          description: meta.data?.description,
          image_url: meta.data?.image?.url,
          favicon_url: meta.data?.logo?.url,
          tags: [],
        })
      } catch {
        await supabase.from('bookmarks').insert({
          user_id: profile.id,
          url,
          title: url,
          tags: [],
        })
      }
    }

    // Reload bookmarks
    const { data: updated } = await supabase
      .from('bookmarks')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
    setBookmarks(updated || [])
    setFiltered(updated || [])
    setImportText('')
    setShowImport(false)
    setImporting(false)
  }

  // Re-embed all bookmarks missing an embedding. Idempotent — the API only
  // touches rows where embedding is null.
  const handleReembedAll = async () => {
    setReembedding(true)
    setReembedStatus('embedding...')
    try {
      const res = await fetch('/api/backfill-embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) {
        setReembedStatus(`error: ${data.error || 'unknown'}`)
      } else if (data.processed === 0) {
        setReembedStatus('nothing to embed')
      } else {
        setReembedStatus(`embedded ${data.processed}${data.errors ? ` (${data.errors} errors)` : ''}`)
      }
    } catch (err: any) {
      setReembedStatus(`error: ${err.message || 'unknown'}`)
    } finally {
      setReembedding(false)
      setTimeout(() => setReembedStatus(null), 4000)
    }
  }

  // Re-tag all bookmarks using AI tagger
  const handleRetagAll = async () => {
    if (!profile) return
    setRetagging(true)
    const updated = [...bookmarks]
    for (let i = 0; i < updated.length; i++) {
      const b = updated[i]
      const newTags = await generateTags(b.url, b.title, b.description)
      if (newTags.length > 0) {
        await supabase.from('bookmarks').update({ tags: newTags }).eq('id', b.id)
        updated[i] = { ...b, tags: newTags }
      }
      // Update UI progressively so you can see it working
      setBookmarks([...updated])
      setFiltered([...updated])
    }
    setRetagging(false)
  }

  // Get all tags
  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags || []))).sort()

  const handleTagToggle = (tag: string) => {
    // Single-select: clicking the active tag clears it, clicking a new one replaces
    const next = selectedTags[0] === tag ? [] : [tag]
    setSelectedTags(next)
    if (next.length === 0) {
      setFiltered(bookmarks)
    } else {
      setFiltered(bookmarks.filter((b) => b.tags?.includes(next[0])))
    }
  }

  if (loading) {
    return <main className="min-h-screen bg-white"><div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div></main>
  }

  if (!profile) {
    return <main className="min-h-screen bg-white"><div className="mx-auto max-w-6xl px-4 py-12 text-center"><p className="text-gray-500">user not found</p></div></main>
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Profile header */}
        <div className="mb-6 border-b border-gray-100 pb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-3xl font-light text-gray-900 mb-2">
                {(profile.display_name || profile.username)}&rsquo;s links
              </h1>
              {profile.bio && <p className="text-gray-500 text-sm mb-3">{profile.bio}</p>}
              {!profile.bio && isOwner && !editingProfile && (
                <p className="text-gray-300 text-sm mb-3 italic cursor-pointer hover:text-gray-400" onClick={() => { setEditingProfile(true); setEditDisplayName(profile.display_name || ''); setEditBio(''); setEditLinks(profile.links || {}) }}>
                  add a short bio...
                </p>
              )}

              {/* Social links */}
              {profile.links && Object.keys(profile.links).length > 0 && (
                <div className="flex gap-4 mb-3">
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

            <div className="flex gap-2">
              {isOwner && !editingProfile && (
                <button
                  onClick={() => { setEditingProfile(true); setEditDisplayName(profile.display_name || ''); setEditBio(profile.bio || ''); setEditLinks(profile.links || {}) }}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-gray-900 transition-colors"
                >
                  edit profile
                </button>
              )}
              {currentUserId && !isOwner && (
                <button
                  onClick={handleFollow}
                  className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
                    isFollowing
                      ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
                  }`}
                >
                  {isFollowing ? 'following' : 'follow'}
                </button>
              )}
            </div>
          </div>

          {/* Profile save error/notice */}
          {profileSaveError && (
            <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
              {profileSaveError}
            </div>
          )}

          {/* Edit profile form */}
          {editingProfile && (
            <div className="bg-gray-50 rounded-lg border border-gray-100 p-6 mb-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">display name</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="your name"
                  maxLength={50}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">bio</label>
                <input
                  type="text"
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="bookmarks that caught my attention"
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
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setEditingProfile(false)}
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-900"
                >
                  cancel
                </button>
                <button
                  disabled={savingProfile}
                  onClick={async () => {
                    setSavingProfile(true)
                    setProfileSaveError(null)

                    // Clean empty values from links
                    const cleanLinks: any = {}
                    if (editLinks.twitter?.trim()) cleanLinks.twitter = editLinks.twitter.trim()
                    if (editLinks.linkedin?.trim()) cleanLinks.linkedin = editLinks.linkedin.trim()
                    if (editLinks.website?.trim()) cleanLinks.website = editLinks.website.trim()

                    const trimmedName = editDisplayName.trim() || null
                    const trimmedBio = editBio.trim() || null

                    // Try with links first
                    const { error: errWithLinks } = await supabase.from('profiles').update({
                      display_name: trimmedName,
                      bio: trimmedBio,
                      links: cleanLinks,
                    }).eq('id', profile.id)

                    if (errWithLinks) {
                      // Fallback: retry without links (schema may be missing the column)
                      const { error: errNoLinks } = await supabase.from('profiles').update({
                        display_name: trimmedName,
                        bio: trimmedBio,
                      }).eq('id', profile.id)

                      if (errNoLinks) {
                        setProfileSaveError(`couldn't save: ${errNoLinks.message}`)
                        setSavingProfile(false)
                        return
                      }

                      // Saved name + bio but links column is missing
                      setProfile({ ...profile, display_name: trimmedName, bio: trimmedBio })
                      setProfileSaveError('saved — but social links need a db migration to persist')
                      setEditingProfile(false)
                      setSavingProfile(false)
                      return
                    }

                    setProfile({ ...profile, display_name: trimmedName, bio: trimmedBio, links: cleanLinks })
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

          <div className="flex items-center justify-between">
            <div className="flex gap-8 text-sm">
              <span><strong className="text-gray-900">{bookmarks.length}</strong> <span className="text-gray-500">links</span></span>
              <Link href={`/${username}/followers`} className="hover:text-gray-900 transition-colors">
                <strong className="text-gray-900">{followers}</strong> <span className="text-gray-500">followers</span>
              </Link>
              <Link href={`/${username}/following`} className="hover:text-gray-900 transition-colors">
                <strong className="text-gray-900">{following}</strong> <span className="text-gray-500">following</span>
              </Link>
            </div>
            {isOwner && (
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <button onClick={handleRetagAll} disabled={retagging} className="hover:text-gray-600 disabled:opacity-50">
                  {retagging ? 'retagging...' : 're-tag all'}
                </button>
                <button onClick={handleReembedAll} disabled={reembedding} className="hover:text-gray-600 disabled:opacity-50">
                  {reembedding ? 'embedding...' : 're-embed all'}
                </button>
                {reembedStatus && <span className="text-gray-500">{reembedStatus}</span>}
                <button onClick={() => setShowImport(!showImport)} className="hover:text-gray-600">import</button>
                <button onClick={handleExport} className="hover:text-gray-600">export</button>
              </div>
            )}
          </div>

          {/* Bulk import panel */}
          {showImport && (
            <div className="mt-4 bg-gray-50 rounded-lg border border-gray-100 p-4 space-y-3">
              <p className="text-xs text-gray-500">Paste URLs, one per line:</p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder={"https://example.com\nhttps://another-site.com"}
                rows={5}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => { setShowImport(false); setImportText('') }} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-900">cancel</button>
                <button
                  onClick={handleImport}
                  disabled={importing || !importText.trim()}
                  className="px-4 py-1.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-50"
                >
                  {importing ? 'importing...' : 'import links'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Save input (owner only) */}
        {isOwner && (
          <div className="mb-6">
            <form onSubmit={handleSave}>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="save a link..."
                  className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
                />
                <button
                  type="submit"
                  disabled={savingUrl || !newUrl}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm"
                >
                  {savingUrl ? 'saving...' : 'save'}
                </button>
                {saveSuccess && (
                  <span className="text-sm text-green-600 self-center animate-pulse">saved!</span>
                )}
              </div>
            </form>
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
              <span className="text-gray-400">or save from any page →</span>
              <Link
                href="/bookmarklet"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-gray-200 bg-white hover:border-gray-400 hover:text-gray-900 transition-colors"
              >
                add the save button to your browser
              </Link>
            </div>
          </div>
        )}

        {/* Search + tags */}
        <div className="mb-5 space-y-3">
          <SearchBar onSearch={handleSearch} placeholder="search your mind..." />
          {allTags.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleTagToggle(tag)}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    selectedTags.includes(tag)
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}
                >
                  {tag}
                </button>
              ))}
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
                tags={b.tags || []}
                allTags={allTags}
                isOwner={isOwner}
                isPrivate={b.is_private}
                onDelete={handleDelete}
                onPrivacyToggle={handlePrivacyToggle}
                onTagsUpdate={handleTagsUpdate}
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
    </main>
  )
}
