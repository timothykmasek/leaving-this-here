'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import Link from 'next/link'

type BookmarkWithProfile = any

export default function DiscoverPage() {
  const router = useRouter()
  const supabase = createClient()

  const [followBookmarks, setFollowBookmarks] = useState<BookmarkWithProfile[]>([])
  const [similarTasteBookmarks, setSimilarTasteBookmarks] = useState<BookmarkWithProfile[]>([])
  const [communityBookmarks, setCommunityBookmarks] = useState<BookmarkWithProfile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDiscover = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // ── Tier 1: people you follow ────────────────────────────────────
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followingIds = (follows || []).map((f) => f.following_id)
      const excludeIds = new Set<string>([user.id, ...followingIds])

      if (followingIds.length > 0) {
        const { data } = await supabase
          .from('bookmarks')
          .select('*, profiles:user_id(username, display_name)')
          .in('user_id', followingIds)
          .eq('is_private', false)
          .order('created_at', { ascending: false })
          .limit(30)
        setFollowBookmarks(data || [])
      }

      // ── Tier 2: people with similar taste (tag overlap) ──────────────
      // Get the current user's tags
      const { data: myBookmarks } = await supabase
        .from('bookmarks')
        .select('tags')
        .eq('user_id', user.id)
        .eq('is_private', false)

      const myTags = new Set<string>()
      for (const b of myBookmarks || []) {
        for (const t of b.tags || []) myTags.add(t)
      }

      if (myTags.size > 0) {
        // Find other users' public bookmarks whose tags overlap with ours
        const { data: candidates } = await supabase
          .from('bookmarks')
          .select('*, profiles:user_id(username, display_name)')
          .eq('is_private', false)
          .overlaps('tags', Array.from(myTags))
          .order('created_at', { ascending: false })
          .limit(100)

        // Exclude self + users you already follow
        const similar = (candidates || []).filter((b: any) => !excludeIds.has(b.user_id)).slice(0, 30)
        setSimilarTasteBookmarks(similar)

        // Track these so they don't show up in community tier
        for (const b of similar) excludeIds.add(b.id)
      }

      // ── Tier 3: fresh from the community ─────────────────────────────
      const { data: fresh } = await supabase
        .from('bookmarks')
        .select('*, profiles:user_id(username, display_name)')
        .eq('is_private', false)
        .order('created_at', { ascending: false })
        .limit(60)

      const shownIds = new Set<string>([
        ...followBookmarks.map((b: any) => b.id),
        ...similarTasteBookmarks.map((b: any) => b.id),
      ])
      const community = (fresh || []).filter((b: any) => b.user_id !== user.id && !shownIds.has(b.id)).slice(0, 30)
      setCommunityBookmarks(community)

      setLoading(false)
    }

    fetchDiscover()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div>
      </main>
    )
  }

  const hasAnything =
    followBookmarks.length > 0 || similarTasteBookmarks.length > 0 || communityBookmarks.length > 0

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-3xl font-light text-gray-900 mb-2">discover</h1>
          <p className="text-gray-500 text-sm">minds worth following</p>
        </div>

        {!hasAnything && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm mb-2">nothing here yet</p>
            <p className="text-gray-400 text-xs">come back once there are more links in the wild</p>
          </div>
        )}

        <Section title="from people you follow" bookmarks={followBookmarks} />
        <Section
          title="people with similar taste"
          subtitle="based on the tags you save"
          bookmarks={similarTasteBookmarks}
        />
        <Section
          title="fresh from the community"
          subtitle="recent links from everyone else"
          bookmarks={communityBookmarks}
        />
      </div>
    </main>
  )
}

function Section({
  title,
  subtitle,
  bookmarks,
}: {
  title: string
  subtitle?: string
  bookmarks: BookmarkWithProfile[]
}) {
  if (!bookmarks || bookmarks.length === 0) return null
  return (
    <section className="mb-14">
      <div className="mb-4">
        <h2 className="text-xs uppercase tracking-widest text-gray-400">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bookmarks.map((b: any) => (
          <div key={b.id}>
            <BookmarkCard
              id={b.id}
              title={b.title}
              description={b.description}
              url={b.url}
              imageUrl={b.image_url}
              screenshotUrl={b.screenshot_url}
              faviconUrl={b.favicon_url}
              tags={b.tags || []}
              allTags={[]}
              isOwner={false}
              isPrivate={false}
            />
            <p className="mt-2 text-xs text-gray-400">
              saved by{' '}
              <Link
                href={`/${b.profiles?.username}`}
                className="text-gray-600 hover:text-gray-900 hover:underline"
              >
                {b.profiles?.display_name || b.profiles?.username}
              </Link>
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
