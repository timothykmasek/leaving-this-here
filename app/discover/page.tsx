'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import Link from 'next/link'

export default function DiscoverPage() {
  const router = useRouter()
  const supabase = createClient()

  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDiscover = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Get who user follows
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id)

      const followingIds = follows?.map((f) => f.following_id) || []

      if (followingIds.length > 0) {
        // Get bookmarks from followed users
        const { data } = await supabase
          .from('bookmarks')
          .select('*, profiles:user_id(username, display_name)')
          .in('user_id', followingIds)
          .eq('is_private', false)
          .order('created_at', { ascending: false })
          .limit(50)

        setBookmarks(data || [])
      }

      setLoading(false)
    }

    fetchDiscover()
  }, [supabase, router])

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900 mb-2">discover</h1>
          <p className="text-gray-500 text-sm">bookmarks from people you follow</p>
        </div>

        {bookmarks.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookmarks.map((b) => (
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
                  isOwner={false}
                  isPrivate={false}
                />
                <p className="mt-2 text-xs text-gray-400">
                  saved by <span className="text-gray-600">{b.profiles?.display_name || b.profiles?.username}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm mb-2">nothing here yet</p>
            <p className="text-gray-400 text-xs">follow people to see what they&apos;re sharing</p>
          </div>
        )}
      </div>
    </main>
  )
}
