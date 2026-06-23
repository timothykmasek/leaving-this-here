'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
import { BulletinHeader } from '@/components/BulletinHeader'

// Public, shareable page for a single list at /username/<slug>. Read-only —
// owners manage membership and rename from their profile. RLS hides private
// lists from everyone but the owner, so a private slug 404s for visitors.

export default function ListPage() {
  const params = useParams()
  const username = params.username as string
  const listSlug = params.listSlug as string
  const supabase = createClient()

  const [state, setState] = useState<'loading' | 'notfound' | 'ready'>('loading')
  const [profile, setProfile] = useState<any>(null)
  const [list, setList] = useState<any>(null)
  const [gems, setGems] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id, username, display_name')
        .eq('username', username)
        .single()
      if (!prof) { setState('notfound'); return }
      setProfile(prof)

      const { data: l, error } = await supabase
        .from('lists')
        .select('id, name, slug, is_private, description, list_bookmarks(bookmark_id)')
        .eq('user_id', prof.id)
        .eq('slug', listSlug)
        .single()
      if (error || !l) { setState('notfound'); return }
      setList(l)

      const ids = (l.list_bookmarks || []).map((x: any) => x.bookmark_id)
      if (ids.length) {
        const { data: bmarks } = await supabase
          .from('bookmarks')
          .select('*')
          .in('id', ids)
          .order('created_at', { ascending: false })
        setGems(bmarks || [])
      }
      setState('ready')
    }
    load()
  }, [username, listSlug, supabase])

  if (state === 'loading') {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-12"><p className="text-gray-400">loading...</p></div>
      </main>
    )
  }

  if (state === 'notfound') {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <p className="text-gray-500">list not found</p>
          <Link href={`/${username}`} className="mt-3 inline-block text-sm text-stone-400 hover:text-ink">
            ← back to profile
          </Link>
        </div>
      </main>
    )
  }

  const owner = profile.display_name || profile.username

  return (
    <main className="min-h-screen bg-paper">
      <BulletinHeader action={{ label: 'Sign in', href: '/login' }} logoClassName="h-[26px] sm:h-[34px]" />
      <div className="mx-auto max-w-[1208px] px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
        <div className="mb-8 border-b border-gray-100 pb-6 sm:mb-10 sm:pb-8">
          <Link
            href={`/${username}`}
            className="text-xs uppercase tracking-wider text-stone-400 hover:text-ink"
          >
            {owner}
          </Link>
          <h1 className="mt-2 font-serif text-2xl sm:text-[28px] font-normal italic tracking-tight text-ink leading-tight">
            {list.name}
          </h1>
          {list.description && (
            <p className="mt-3 text-sm text-stone-600">
              {list.description}
            </p>
          )}
          <div className="mt-3 flex gap-5 text-xs uppercase tracking-wider text-gray-400">
            <span>
              <span className="text-gray-900 font-medium">{gems.length}</span>{' '}
              <span>{gems.length === 1 ? 'find' : 'finds'}</span>
            </span>
            {list.is_private && <span className="text-stone-400">private</span>}
          </div>
        </div>

        {gems.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
            {gems.map((b) => (
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
                isOwner={false}
                cardType={b.card_type}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">empty list</p>
          </div>
        )}
      </div>
    </main>
  )
}
