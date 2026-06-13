import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { GemGlyph } from '@/components/GemGlyph'
import { Carousel } from '@/components/Carousel'
import { CarouselCard } from '@/components/CarouselCard'
import { ClaimField } from '@/components/ClaimField'
import { FEATURED_URLS } from '@/lib/featured'

export default async function Home({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  // OAuth can land here with `?code=` instead of on /auth/callback when Supabase
  // falls back to its Site URL (e.g. the apex 308-redirects to www/). Forward it
  // to the callback so the code is exchanged and the user lands on their profile
  // rather than getting stranded, logged-in, on the marketing home page.
  if (searchParams?.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(searchParams.code)}`)
  }

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
      // Signed in but no page yet → the onboarding finish step (it falls back
      // to /setup itself if there's no stashed flow state in this browser).
      redirect('/start?finish=1')
    }
  }

  // Public landing examples: curated picks (FEATURED_URLS) in their given
  // order, else fall back to recent image-bearing finds.
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
            A Beautiful Home
            <br />
            <span className="italic text-stone-600">for Your Links</span>
          </h1>
          <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-stone-500">
            Collect, organize, and share the links worth keeping.
          </p>

          <div className="mt-10 text-center">
            <ClaimField />
          </div>
        </div>
      </section>

      {/* Recent community bookmarks */}
      <section id="showcase" className="mx-auto max-w-6xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif">recent finds from the community</p>
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
          <div className="grid sm:grid-cols-3 gap-12">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif mb-2">1 · save</p>
              <h3 className="font-serif text-xl text-ink mb-2">one click, from any page</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                the chrome extension catches articles, videos, podcasts, tweets — anything you find lands in the same place.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif mb-2">2 · find</p>
              <h3 className="font-serif text-xl text-ink mb-2">search the way you remember</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                AI search means &ldquo;that essay about slow productivity&rdquo; just works — no digging for exact titles.
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-serif mb-2">3 · share</p>
              <h3 className="font-serif text-xl text-ink mb-2">your collection writes itself</h3>
              <p className="text-sm text-stone-500 leading-relaxed">
                every save shows up on your public page, beautifully rendered — and you can publish lists of your best finds for anyone to browse.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA with handle input */}
      <section className="border-t border-stone-300/50 bg-stone-200/25">
        <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
          <div className="mb-5 flex justify-center text-ink/45"><GemGlyph className="h-7 w-7" /></div>
          <h2 className="font-serif text-3xl font-normal text-ink mb-4">your public page</h2>
          <p className="text-sm text-stone-500 mb-8">
            tell us what you&rsquo;re about — three questions. then every link you save appears there.
          </p>
          <ClaimField />
        </div>
      </section>
    </main>
  )
}
