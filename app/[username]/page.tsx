'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { SearchBar } from '@/components/SearchBar'

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

  const handleSearch = (query: string) => {
    const q = query.toLowerCase()
    if (!q) { setFiltered(bookmarks); return }
    setFiltered(bookmarks.filter((b) =>
      [b.title, b.description, b.url, ...(b.tags || [])].some(
        (field) => field && field.toLowerCase().includes(q)
      )
    ))
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUrl || !profile) return
    setSavingUrl(true)

    try {
      const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(newUrl)}`)
      const meta = await res.json()

      const { error } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url: newUrl,
        title: meta.data?.title || newUrl,
        description: meta.data?.description,
        image_url: meta.data?.image?.url,
        screenshot_url: meta.data?.screenshot?.url,
        favicon_url: meta.data?.logo?.url,
        tags: [],
      })

      if (!error) {
        const { data: updated } = await supabase
          .from('bookmarks')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
        setBookmarks(updated || [])
        setFiltered(updated || [])
        setNewUrl('')
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

  // Get all tags
  const allTags = Array.from(new Set(bookmarks.flatMap((b) => b.tags || []))).sort()

  const handleTagToggle = (tag: string) => {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((t) => t !== tag)
      : [...selectedTags, tag]
    setSelectedTags(next)
    if (next.length === 0) {
      setFiltered(bookmarks)
    } else {
      setFiltered(bookmarks.filter((b) => next.every((t) => b.tags?.includes(t))))
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
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Profile header */}
        <div className="mb-12 border-b border-gray-100 pb-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-light text-gray-900 mb-2">
                {profile.display_name || profile.username}
              </h1>
              {profile.bio && <p className="text-gray-500 text-sm">{profile.bio}</p>}
            </div>
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
          <div className="flex gap-8 text-sm">
            <span><strong className="text-gray-900">{bookmarks.length}</strong> <span className="text-gray-500">links</span></span>
            <span><strong className="text-gray-900">{followers}</strong> <span className="text-gray-500">followers</span></span>
            <span><strong className="text-gray-900">{following}</strong> <span className="text-gray-500">following</span></span>
          </div>
        </div>

        {/* Save input (owner only) */}
        {isOwner && (
          <form onSubmit={handleSave} className="mb-12">
            <div className="flex gap-2">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="paste a link..."
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
              />
              <button
                type="submit"
                disabled={savingUrl || !newUrl}
                className="px-6 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm"
              >
                {savingUrl ? 'saving...' : 'save'}
              </button>
            </div>
          </form>
        )}

        {/* Search + tags */}
        <div className="mb-8 space-y-4">
          <SearchBar onSearch={handleSearch} placeholder="search links..." />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                isOwner={isOwner}
                isPrivate={b.is_private}
                onDelete={handleDelete}
                onPrivacyToggle={handlePrivacyToggle}
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
