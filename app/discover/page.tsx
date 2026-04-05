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
  const [communityBookmarks, setCommunityBookmarks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)

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

        setCurrentUser(user)

        // Get people the user follows
        const { data: followingData } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', user.id)

        const followingIds = followingData?.map((f) => f.following_id) || []

        // Get bookmarks from followed users
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

        // Also get recent community bookmarks (from everyone except current user)
        const { data: communityData } = await supabase
          .from('bookmarks')
          .select(`*, profiles:user_id(username, display_name)`)
          .neq('user_id', user.id)
          .eq('is_private', false)
          .order('created_at', { ascending: false })
          .limit(50)
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

  // Show followed bookmarks if available, otherwise show community
  const hasFollowing = followingBookmarks.length > 0
  const displayBookmarks = hasFollowing ? followingBookmarks : communityBookmarks

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900 mb-2">
            discover
          </h1>
          <p className="text-gray-500 text-sm">
            {hasFollowing
              ? 'recent saves from people you follow'
              : 'recent saves from the community'}
          </p>
        </div>

        {displayBookmarks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {displayBookmarks.map((bookmark) => (
              <div key={bookmark.id}>
                <BookmarkCard
                  id={bookmark.id}
                  title={bookmark.title}
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
                      {bookmark.profiles?.display_name ||
                        bookmark.profiles?.username}
                    </span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              no bookmarks to discover yet
            </p>
          </div>
        )}
      </div>
    </main>
  )
}
