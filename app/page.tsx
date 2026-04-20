import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

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

  // Public landing — showcase 6 folios (one per creator) with 3 recent link
  // thumbnails each. Anon role + RLS allows reading non-private bookmarks.
  const { data: rawPreview } = await supabase
    .from('bookmarks')
    .select(
      'id, url, title, image_url, screenshot_url, favicon_url, user_id, created_at, profiles:user_id(username, display_name, bio)'
    )
    .eq('is_private', false)
    .or('image_url.not.is.null,screenshot_url.not.is.null')
    .order('created_at', { ascending: false })
    .limit(500)

  // Group by user; keep up to 3 most-recent bookmarks per user for thumbnails.
  type Folio = {
    user_id: string
    profile: any
    thumbnails: any[]
    total: number
  }
  const byUser = new Map<string, Folio>()
  for (const b of rawPreview || []) {
    let entry = byUser.get(b.user_id)
    if (!entry) {
      entry = { user_id: b.user_id, profile: b.profiles, thumbnails: [], total: 0 }
      byUser.set(b.user_id, entry)
    }
    if (entry.thumbnails.length < 3) entry.thumbnails.push(b)
    entry.total += 1
  }

  // Shuffle so the showcase feels fresh on each load, then take 6 folios.
  const folios = Array.from(byUser.values()).filter((f) => f.profile?.username)
  for (let i = folios.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[folios[i], folios[j]] = [folios[j], folios[i]]
  }
  const showcase = folios.slice(0, 6)

  return (
    <main className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-32 mx-auto h-[640px] max-w-4xl rounded-full opacity-60 blur-3xl"
          style={{
            background:
              'radial-gradient(closest-side, rgba(255,180,140,0.55), rgba(255,220,190,0.35) 40%, rgba(255,255,255,0) 70%)',
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 pt-24 pb-20 sm:px-6 lg:px-8 text-center">
          <h1 className="text-6xl sm:text-7xl font-light tracking-tight text-gray-900 leading-[1.05]">
            Save. Publish.
            <br />
            <span className="italic text-gray-700">Subscribe.</span>
          </h1>

          <p className="mt-8 text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            The lightest way to publish online. Save a link while you browse, your
            folio builds itself, readers subscribe to your taste.
          </p>

          <div className="mt-10 flex items-center justify-center gap-3">
            <Link
              href="/login?mode=signup"
              className="text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-7 py-3.5 rounded-full shadow-sm transition-colors"
            >
              start your folio
            </Link>
            <a
              href="#showcase"
              className="text-sm font-medium text-gray-700 hover:text-gray-900 px-5 py-3 rounded-full transition-colors"
            >
              explore folios
            </a>
          </div>
        </div>
      </section>

      {/* Folio showcase */}
      <section id="showcase" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">showcase</p>
          <h2 className="text-3xl font-light text-gray-900">folios worth subscribing to</h2>
        </div>

        {showcase.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {showcase.map((folio) => (
              <Link
                key={folio.user_id}
                href={`/${folio.profile.username}`}
                className="group block rounded-2xl border border-gray-100 bg-white p-5 hover:border-gray-200 hover:shadow-sm transition-all"
              >
                {/* Thumbnail strip */}
                <div className="grid grid-cols-3 gap-1.5 mb-5">
                  {folio.thumbnails.map((t) => {
                    const src = t.image_url || t.screenshot_url || t.favicon_url
                    return (
                      <div
                        key={t.id}
                        className="aspect-[4/3] rounded-md overflow-hidden bg-gray-50"
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={src}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                          />
                        ) : null}
                      </div>
                    )
                  })}
                </div>

                {/* Folio meta */}
                <div>
                  <h3 className="text-xl font-medium text-gray-900 group-hover:underline underline-offset-4 decoration-gray-300">
                    {folio.profile.display_name || folio.profile.username}
                  </h3>
                  {folio.profile.bio && (
                    <p className="text-sm text-gray-500 italic mt-1.5 leading-snug line-clamp-2">
                      {folio.profile.bio}
                    </p>
                  )}
                  <p className="text-xs uppercase tracking-wider text-gray-400 mt-3">
                    {folio.total} {folio.total === 1 ? 'link' : 'links'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-10">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">1 · save</p>
              <h3 className="text-lg font-medium text-gray-900 mb-2">one click, from any page</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                articles, videos, podcasts, tweets — it all lands in the same place.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">2 · publish</p>
              <h3 className="text-lg font-medium text-gray-900 mb-2">your folio writes itself</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                every save shows up on your public page, beautifully rendered — no extra work.
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">3 · subscribe</p>
              <h3 className="text-lg font-medium text-gray-900 mb-2">readers follow your taste</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                a digest lands in their inbox every 10 links — or once a month, whichever comes first.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">who it&apos;s for</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">designers</p>
            <p className="text-xs text-gray-500">curating inspiration</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">writers</p>
            <p className="text-xs text-gray-500">publishing what&apos;s on their mind</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">vcs</p>
            <p className="text-xs text-gray-500">sharing weekend reading</p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900 mb-1">teams</p>
            <p className="text-xs text-gray-500">building a public reading list</p>
          </div>
        </div>
      </section>

      {/* Bottom CTA with handle input */}
      <section className="border-t border-gray-100 bg-gray-50/50">
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-light text-gray-900 mb-4">start your folio →</h2>
          <p className="text-sm text-gray-500 mb-8">
            pick a handle, start saving, watch your folio take shape.
          </p>
          <form action="/login" method="get" className="flex items-stretch gap-2 max-w-md mx-auto">
            <input type="hidden" name="mode" value="signup" />
            <div className="flex-1 flex items-stretch border border-gray-200 rounded-full bg-white overflow-hidden focus-within:ring-1 focus-within:ring-gray-400">
              <span className="flex items-center pl-5 pr-1 text-sm text-gray-400 select-none">
                leavingthishere.com/
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
