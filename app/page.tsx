import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LinkCard } from '@/components/LinkCard'
import { BulletinHeader } from '@/components/BulletinHeader'
import { pickCardImage } from '@/lib/cardImage'
import { FEATURED_URLS } from '@/lib/featured'

const SHOWCASE_COUNT = 16

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function cleanTitle(title: string | null, url: string): string {
  const t = (title || '').trim()
  if (!t || t.startsWith('http')) return domainOf(url)
  return t
}

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

  // Showcase examples: curated picks (FEATURED_URLS) in their given order, else
  // fall back to recent image-bearing finds.
  let finds: any[] = []
  if (FEATURED_URLS.length > 0) {
    const { data } = await supabase.from('bookmarks').select('*').in('url', FEATURED_URLS)
    finds = FEATURED_URLS.map((u) => (data || []).find((b) => b.url === u)).filter(Boolean)
  } else {
    const { data } = await supabase
      .from('bookmarks')
      .select('*')
      .or('image_url.not.is.null,screenshot_url.not.is.null')
      .order('created_at', { ascending: false })
      .limit(SHOWCASE_COUNT)
    finds = data || []
  }
  finds = finds.slice(0, SHOWCASE_COUNT)

  // Map each showcase find → the (public) list it belongs to, if any. That list
  // name becomes the card's tag; finds not in a public list show no tag.
  const listByBookmark = new Map<string, string>()
  const ids = finds.map((b) => b.id)
  if (ids.length) {
    const { data: memberships } = await supabase
      .from('list_bookmarks')
      .select('bookmark_id, lists(name, is_private)')
      .in('bookmark_id', ids)
    for (const m of (memberships as any[]) || []) {
      const list = Array.isArray(m.lists) ? m.lists[0] : m.lists
      if (list && !list.is_private && !listByBookmark.has(m.bookmark_id)) {
        listByBookmark.set(m.bookmark_id, list.name)
      }
    }
  }

  return (
    <div className="min-h-screen bg-paper">
      <BulletinHeader action={{ label: 'Sign in', href: '/login' }} logoClassName="h-[34px] sm:h-[44px]" />

      {/* Hero */}
      <section className="px-6 pb-20 pt-10 text-center">
        {/* Two understated bold Cardo lines (matches the Figma treatment). */}
        <h1 className="font-serif text-[26px] font-bold leading-[1.2] text-ink">
          A home for your links
        </h1>
        <p className="mx-auto mt-3 max-w-[34rem] font-serif text-[20px] font-bold leading-snug text-ink">
          Collect, organize, and share the links worth keeping.
        </p>

        {/* Single primary action. */}
        <div className="mt-9 flex justify-center">
          <a
            href="/login?mode=signup"
            className="label rounded-full bg-ink px-7 py-3 text-paper transition-colors hover:bg-black"
          >
            Sign up — it’s free
          </a>
        </div>
      </section>

      {/* Showcase — Bulletin card grid of community finds */}
      <section className="px-4 pb-28 sm:px-6 lg:px-10">
        <div className="mx-auto grid w-[1184px] max-w-full grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4 lg:gap-x-8 lg:gap-y-12">
          {finds.map((b) => (
            <LinkCard
              key={b.id}
              url={b.url}
              title={cleanTitle(b.title, b.url)}
              image={pickCardImage(b.url, b.image_url, b.screenshot_url)}
              listName={listByBookmark.get(b.id) ?? null}
            />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/[0.06] px-10 py-12">
        <div className="mx-auto flex w-[1184px] max-w-full flex-col items-center gap-6 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bulletin-logo.png" alt="Bulletin" className="h-[20px] w-auto opacity-80" />
            <span className="label text-black/35">© 2026</span>
          </div>
          <nav className="flex items-center gap-8">
            <a href="/login?mode=signup" className="label text-black/45 transition-colors hover:text-ink">Sign up</a>
            <a href="/login" className="label text-black/45 transition-colors hover:text-ink">Sign in</a>
            <a href="/privacy" className="label text-black/45 transition-colors hover:text-ink">Privacy</a>
            <a href="https://chromewebstore.google.com/detail/according-to-save-anything/dgpigmcmbffpoigjalnbgfmpgidoabgc" target="_blank" rel="noopener noreferrer" className="label text-black/45 transition-colors hover:text-ink">Extension</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
