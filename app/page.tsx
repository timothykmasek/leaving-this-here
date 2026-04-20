import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { BookmarkCard } from '@/components/BookmarkCard'

export default async function Home() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profile) {
      redirect(`/${profile.username}`)
    } else {
      redirect('/setup')
    }
  }

  // Public preview — recent community bookmarks for non-logged-in visitors.
  // Anon role + RLS allows reading non-private bookmarks, so this just works.
  // We pull enough rows to span every active persona, then keep only one
  // bookmark per user so the grid always shows 12 *different* people.
  const { data: rawPreview } = await supabase
    .from('bookmarks')
    .select(
      'id, url, title, description, image_url, screenshot_url, favicon_url, tags, raw_metadata, user_id, created_at, profiles:user_id(username, display_name)'
    )
    .eq('is_private', false)
    .or('image_url.not.is.null,screenshot_url.not.is.null')
    .order('created_at', { ascending: false })
    .limit(400)

  // Group by user, keep most-recent per user, then take 12 distinct users.
  // Shuffle the user order so the grid feels fresh on each request.
  const seenUsers = new Set<string>()
  const oneEach: any[] = []
  for (const b of rawPreview || []) {
    if (seenUsers.has(b.user_id)) continue
    seenUsers.add(b.user_id)
    oneEach.push(b)
  }
  // Fisher-Yates shuffle for variety on reload
  for (let i = oneEach.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[oneEach[i], oneEach[j]] = [oneEach[j], oneEach[i]]
  }
  const previewBookmarks = oneEach.slice(0, 12)

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Soft warm gradient backdrop */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-[640px] max-w-4xl rounded-full opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(255,180,140,0.55), rgba(255,220,190,0.35) 40%, rgba(255,255,255,0) 70%)',
          }}
        />

        <div className="relative mx-auto max-w-4xl px-4 pt-20 pb-16 sm:px-6 lg:px-8 text-center">
          <h1 className="text-5xl sm:text-6xl font-light tracking-tight text-gray-900 leading-[1.05]">
            save what you find.
            <br />
            <span className="italic text-gray-700">share what you love.</span>
          </h1>

          <p className="mt-6 text-lg text-gray-600 max-w-xl mx-auto leading-relaxed">
            a quiet corner of the internet for the things worth keeping. bookmark
            anything in one click, find it again later, and share only what you
            want.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 px-5 py-3 rounded-full transition-colors"
            >
              log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-6 py-3 rounded-full shadow-sm transition-colors"
            >
              sign up — it&apos;s free
            </Link>
          </div>
        </div>
      </section>

      {/* Live community preview */}
      <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
            recently saved
          </p>
          <h2 className="text-2xl font-light text-gray-900">
            real links from real people
          </h2>
        </div>

        {previewBookmarks && previewBookmarks.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {previewBookmarks.map((bookmark: any) => (
              <div key={bookmark.id}>
                <BookmarkCard
                  id={bookmark.id}
                  title={bookmark.title}
                  description={bookmark.description}
                  url={bookmark.url}
                  imageUrl={bookmark.image_url}
                  screenshotUrl={bookmark.screenshot_url}
                  faviconUrl={bookmark.favicon_url}
                  rawMetadata={bookmark.raw_metadata}
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
        )}

        <div className="mt-10 text-center">
          <Link
            href="/discover"
            className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-4"
          >
            see more on discover →
          </Link>
        </div>

        {/* Three-up value props */}
        <div className="mt-16 grid sm:grid-cols-3 gap-10 text-center">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">save anything</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              one-click bookmark from any browser. articles, products, videos,
              tweets — they all land in the same calm place.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">find it again</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              search across everything you&apos;ve saved. fuzzy, forgiving, fast —
              search by what you remember, not what you typed.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">yours to share</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              browse by tags and themes. share your collection publicly, or keep
              it just for you.
            </p>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-20 text-center">
          <Link
            href="/login?mode=signup"
            className="inline-block text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-8 py-4 rounded-full shadow-sm transition-colors"
          >
            start saving
          </Link>
        </div>
      </section>
    </main>
  )
}
