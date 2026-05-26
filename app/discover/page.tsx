'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'

export default function DiscoverPage() {
  const supabase = createClient()
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await supabase
          .from('bookmarks')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(96)
        setBookmarks(data || [])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [supabase])

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <p className="text-gray-400">loading...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-10">
          <h1 className="text-3xl font-light text-gray-900 mb-2">discover</h1>
          <p className="text-gray-500 text-sm">
            fresh gems, recently saved
          </p>
        </div>

        {bookmarks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {bookmarks.map((b) => (
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
                note={b.note}
                isOwner={false}
                cardType={b.card_type}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">no gems to discover yet 💎</p>
          </div>
        )}
      </div>
    </main>
  )
}
