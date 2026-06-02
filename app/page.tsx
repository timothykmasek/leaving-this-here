import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GemGlyph } from '@/components/GemGlyph'
import { Carousel } from '@/components/Carousel'
import { CarouselCard } from '@/components/CarouselCard'
import { FEATURED_URLS } from '@/lib/featured'

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

  // Public landing examples: curated picks (FEATURED_URLS) in their given
  // order, else fall back to recent image-bearing gems.
  let recent: any[] = []
  if (FEATURED_URLS.length > 0) {
    const { data } = await supabase.from('bookmarks').select('*').in('url', FEATURED_URLS)
    recent = FEATURED_URLS.map((u) => (data || []).find((b) => b.url === u)).filter(Boolean)
  } else {
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .or('image_url.not.is.null,screenshot_url.not.is.null')
      .order('created_at', { ascending: false })
      .limit(12)
    recent = data || []
  }

  return (
    <main className="min-h-screen bg-paper">
      {/* Hero */}
      <section className="relative">
        <div className="mx-auto max-w-2xl px-6 pt-28 pb-24 text-center sm:px-8">
          <h1 className="font-serif text-[2rem] font-normal leading-[1.28] tracking-tight text-ink sm:text-[2.5rem]">
            Collect and share
            <br />
            <span className="italic text-stone-600">the internet&rsquo;s best finds.</span>
          </h1>

          <div className="mt-10">
            <Link
              href="/login?mode=signup"
              className="inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-medium tracking-wide text-paper transition-colors hover:bg-ink/85"
            >
              start collecting
            </Link>
          </div>
        </div>
      </section>

      {/* Recent community bookmarks */}
      <section id="showcase" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif">recent gems from the community</p>
        </div>

        {recent && recent.length > 0 && (
          <Carousel>
            {recent.map((b) => (
              <CarouselCard key={b.id} b={b} />
            ))}
          </Carousel>
        )}
      </section>

      {/* How it works */}
      <section className="border-t border-stone-300/50 bg-stone-200/25">
        <div className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 gap-12">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif mb-2">1 · save</p>
              <h3 className="font-serif text-xl text-ink mb-2">one click, from any page</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                articles, videos, podcasts, tweets — any internet gem lands in the same place.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif mb-2">2 · share</p>
              <h3 className="font-serif text-xl text-ink mb-2">your collection writes itself</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                every save shows up on your public page, beautifully rendered — no extra work.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA with handle input */}
      <section className="border-t border-stone-300/50 bg-stone-200/25">
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
          <div className="mb-5 flex justify-center text-ink/45"><GemGlyph className="h-7 w-7" /></div>
          <h2 className="font-serif text-3xl font-normal text-ink mb-4">start your collection</h2>
          <p className="text-sm text-stone-500 mb-8">
            pick a handle, start saving, watch your gems pile up.
          </p>
          <form action="/login" method="get" className="flex items-stretch gap-2 max-w-md mx-auto">
            <input type="hidden" name="mode" value="signup" />
            <div className="flex-1 flex items-stretch border border-stone-300 rounded-full bg-white/70 overflow-hidden focus-within:ring-1 focus-within:ring-stone-400">
              <span className="flex items-center pl-5 pr-1 text-sm text-stone-400 select-none">
                internet-gems.com/
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
              className="px-6 py-3 bg-ink text-white rounded-full text-sm font-semibold hover:bg-ink/85 transition-colors whitespace-nowrap"
            >
              claim it
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}
