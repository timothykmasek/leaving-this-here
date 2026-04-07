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
            anything in one click, see what others are reading, and follow people
            whose taste you trust.
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

          <p className="mt-4 text-xs text-gray-400">
            no algorithms, no noise, no ads
          </p>
        </div>
      </section>

      {/* Product preview */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white p-6 sm:p-10 shadow-sm">
          <div className="mb-6">
            <h2 className="text-xl font-medium text-gray-900">alice</h2>
            <p className="text-sm text-gray-500 mt-1">
              bookmarks that caught my attention
            </p>
            <div className="mt-3 flex gap-6 text-sm">
              <span><strong className="text-gray-900">24</strong> <span className="text-gray-500">links</span></span>
              <span><strong className="text-gray-900">8</strong> <span className="text-gray-500">followers</span></span>
              <span><strong className="text-gray-900">12</strong> <span className="text-gray-500">following</span></span>
            </div>
          </div>

          <div className="mb-5">
            <div className="w-full px-5 py-3 text-base italic text-gray-400 border border-gray-200 rounded-xl bg-white">
              search your mind...
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              'from-orange-100 to-amber-50',
              'from-stone-100 to-stone-50',
              'from-rose-100 to-rose-50',
              'from-sky-100 to-sky-50',
              'from-emerald-100 to-emerald-50',
              'from-violet-100 to-violet-50',
              'from-zinc-100 to-zinc-50',
              'from-yellow-100 to-yellow-50',
            ].map((g, i) => (
              <div
                key={i}
                className={`aspect-square bg-gradient-to-br ${g} rounded-xl border border-gray-100`}
              />
            ))}
          </div>
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
            <p className="text-sm font-medium text-gray-900 mb-1">discover good taste</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              follow people whose taste you trust, and find new ones through the
              tags you both care about.
            </p>
          </div>
        </div>

        {/* Final CTA */}
        <div className="mt-20 text-center">
          <Link
            href="/login?mode=signup"
            className="inline-block text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-8 py-4 rounded-full shadow-sm transition-colors"
          >
            start your collection
          </Link>
        </div>
      </section>
    </main>
  )
}
