'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import Link from 'next/link'

export default function DiscoverPage() {
  const router = useRouter()
  const supabase = createClient()

  const [followingBookmarks, setFollowingBookmarks] = useState<any[]>([])
  const [similarBookmarks, setSimilarBookmarks] = useState<any[]>([])
  const [communityBookmarks, setCommunityBookmarks] = useState<any[]>([])
  const [sharedTags, setSharedTags] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBookmarks = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        // 1. Following
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)

        const followingIds = followingData?.map((f) => f.following_id) || []

        if (followingIds.length > 0) {
          const { data: followedData } = await supabase
            .from('bookmarks')
            .select(`*, profiles:user_id(username, display_name)`)
            .in('user_id', followingIds)
            .eq('is_private', false)
            .order('created_at', { ascending: false })
            .limit(50)
          setFollowingBookmarks(followedData || [])
        }

        // 2. Similar interests — based on tag overlap with current user.
        // Pull current user's tags from their own bookmarks.
        const { data: myBookmarks } = await supabase
          .from('bookmarks')
          .select('tags')
          .eq('user_id', user.id)

        const myTags = Array.from(
          new Set(
            (myBookmarks || []).flatMap((b: any) => b.tags || []).filter(Boolean)
          )
        )

        if (myTags.length > 0) {
          // Find public bookmarks that share at least one tag,
          // excluding ones from the user themselves and from people they follow
          // (those are already covered by the Following feed).
          const exclude = [user.id, ...followingIds]
          const { data: tagMatches } = await supabase
            .from('bookmarks')
            .select(`*, profiles:user_id(username, display_name)`)
            .overlaps('tags', myTags)
            .eq('is_private', false)
            .not('user_id', 'in', `(${exclude.join(',')})`)
            .order('created_at', { ascending: false })
            .limit(50)

          // Rank by how many shared tags each bookmark has
          const ranked = (tagMatches || [])
            .map((b: any) => ({
              ...b,
              _overlap: (b.tags || []).filter((t: string) => myTags.includes(t)).length,
            }))
            .sort((a: any, b: any) => b._overlap - a._overlap)

          setSimilarBookmarks(ranked.slice(0, 24))
          setSharedTags(myTags.slice(0, 6))
        }

        // 3. Fallback / fresh community feed
        const { data: communityData } = await supabase
          .from('bookmarks')
          .select(`*, profiles:user_id(username, display_name)`)
          .neq('user_id', user.id)
          .eq('is_private', false)
          .order('created_at', { ascending: false })
          .limit(24)
        setCommunityBookmarks(communityData || [])
      } finally {
        setLoading(false)
      }
    }

    fetchBookmarks()
  }, [supabase, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-gray-400">loading...</p>
        </div>
      </main>
    )
  }

  const renderGrid = (items: any[]) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((bookmark) => (
        <div key={bookmark.id}>
          <BookmarkCard
            id={bookmark.id}
            title={bookmark.title}
            description={bookmark.description}
            url={bookmark.url}
            imageUrl={bookmark.image_url}
            screenshotUrl={bookmark.screenshot_url}
            faviconUrl={bookmark.favicon_url}
            tags={bookmark.tags || []}
            isOwner={false}
            isPrivate={false}
          />
          <div className="mt-1.5 px-1">
            <Link
              href={`/${bookmark.profiles?.username}`}
              className="text-[11px] text-gray-400 hover:text-gray-600 transition-colors"
            >
              saved by{' '}
              <span className="font-medium">
                {bookmark.profiles?.display_name || bookmark.profiles?.username}
              </span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  )

  const showFollowing = followingBookmarks.length > 0
  const showSimilar = similarBookmarks.length > 0
  const nothingYet = !showFollowing && !showSimilar && communityBookmarks.length === 0

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-3xl font-light text-gray-900 mb-2">discover</h1>
          <p className="text-gray-500 text-sm">
            recent saves from people you follow and people who share your taste
          </p>
        </div>

        {showFollowing && (
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-4">
              from people you follow
            </h2>
            {renderGrid(followingBookmarks)}
          </section>
        )}

        {showSimilar && (
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-1">
              people with similar taste
            </h2>
            {sharedTags.length > 0 && (
              <p className="text-xs text-gray-400 mb-4">
                based on your interest in{' '}
                {sharedTags.map((t, i) => (
                  <span key={t}>
                    <span className="text-gray-600">{t}</span>
                    {i < sharedTags.length - 1 ? ', ' : ''}
                  </span>
                ))}
              </p>
            )}
            {renderGrid(similarBookmarks)}
          </section>
        )}

        {!showFollowing && !showSimilar && communityBookmarks.length > 0 && (
          <section className="mb-16">
            <h2 className="text-xs uppercase tracking-wider text-gray-400 mb-4">
              fresh from the community
            </h2>
            {renderGrid(communityBookmarks)}
          </section>
        )}

        {nothingYet && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">no bookmarks to discover yet</p>
          </div>
        )}
      </div>
    </main>
  )
}
