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

  // Public landing — pull recent community bookmarks (with images, so the
  // grid looks alive on first paint). No attribution per v1.
  const { data: recent } = await supabase
    .from('bookmarks')
    .select('*')
    .or('image_url.not.is.null,screenshot_url.not.is.null')
    .order('created_at', { ascending: false })
    .limit(12)

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-[640px] max-w-4xl rounded-full opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(180,220,255,0.55), rgba(220,200,255,0.35) 40%, rgba(255,255,255,0) 70%)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pt-24 pb-20 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-6 text-6xl" aria-hidden>💎</div>
          <h1 className="text-5xl sm:text-6xl font-light tracking-tight text-gray-900 leading-[1.1] max-w-3xl mx-auto">
            A home for the internet gems
            <br />
            <span className="italic text-gray-700">you don&rsquo;t want to lose.</span>
          </h1>

          <div className="mt-10 flex items-center justify-center">
            <Link
              href="/login?mode=signup"
              className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-7 py-3.5 rounded-full shadow-sm transition-colors"
            >
              start collecting
            </Link>
          </div>
        </div>
      </section>

      {/* Recent community bookmarks */}
      <section id="showcase" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-wider text-gray-400">recent gems from the community</p>
        </div>

        {recent && recent.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {recent.map((b) => (
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
        )}
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">1 · save</p>
              <h3 className="text-lg font-medium text-gray-900 mb-2">one click, from any page</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                articles, videos, podcasts, tweets — any internet gem lands in the same place.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">2 · share</p>
              <h3 className="text-lg font-medium text-gray-900 mb-2">your collection writes itself</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                every save shows up on your public page, beautifully rendered — no extra work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA with handle input */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
          <div className="flex justify-center mb-4 text-3xl" aria-hidden>💎</div>
          <h2 className="text-4xl font-light text-gray-900 mb-4">start your collection →</h2>
          <p className="text-sm text-gray-500 mb-8">
            pick a handle, start saving, watch your gems pile up.
          </p>
          <form action="/login" method="get" className="flex items-stretch gap-2 max-w-md mx-auto">
            <input type="hidden" name="mode" value="signup" />
            <div className="flex-1 flex items-stretch border border-gray-200 rounded-full bg-white overflow-hidden focus-within:ring-1 focus-within:ring-gray-400">
              <span className="flex items-center pl-5 pr-1 text-sm text-gray-400 select-none">
                internetgems.com/
              </span>
              <input
                type="text"
                name="handle"
                placeholder="yourname"
                autoComplete="off"
                className="flex-1 py-3 pr-4 text-sm bg-transparent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              claim it
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
