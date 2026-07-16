// PREVIEW-ONLY: reworked homepage in the Bulletin direction. Guidance from
// Figma node 695:1111 (treated loosely — interpreted/polished, not pixel-matched).
// Real community finds in the showcase grid. Safe to delete.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LinkCard } from '@/components/LinkCard'
import { BulletinHeader } from '@/components/BulletinHeader'
import { pickCardImage } from '@/lib/cardImage'

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

// Small decorative rivet dot, scattered through the hero for texture.
function HeroDot({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[8px] w-[8px] rounded-full bg-black/[0.12] ${className}`} />
}

export default function HomePreview() {
  const [finds, setFinds] = useState<any[]>([])

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data } = await supabase
        .from('bookmarks')
        .select('*')
        .or('image_url.not.is.null,screenshot_url.not.is.null')
        .order('created_at', { ascending: false })
        .limit(SHOWCASE_COUNT)
      setFinds(data || [])
    })()
  }, [])

  return (
    <div className="min-h-screen bg-paper">
      <BulletinHeader action={{ label: 'Sign in', href: '/login' }} logoClassName="h-[44px]" />

      {/* Hero */}
      <section className="relative px-6 pb-20 pt-10 text-center">
        {/* scattered texture dots */}
        <HeroDot className="left-[12%] top-[60%]" />
        <HeroDot className="left-[26%] top-[72%]" />
        <HeroDot className="left-[38%] top-[64%]" />
        <HeroDot className="right-[20%] top-[10%]" />

        {/* Both lines Cardo Bold, near-equal size, dark — matches the Figma
            treatment (two understated bold lines), not a big-headline hierarchy. */}
        <h1 className="font-serif text-[26px] font-bold leading-[1.2] text-ink">
          A home for your links
        </h1>
        <p className="mx-auto mt-3 max-w-[34rem] font-serif text-[20px] font-bold leading-snug text-ink">
          Collect, organize, and share the links worth keeping.
        </p>

        {/* Single primary action — extension lives in the footer, not here. */}
        <div className="mt-9 flex justify-center">
          <a
            href="/login?mode=signup"
            className="label rounded-full bg-ink px-7 py-3 text-paper transition-colors hover:bg-black"
          >
            Sign up — it’s free
          </a>
        </div>
      </section>

      {/* Showcase — Bulletin card grid of real community finds */}
      <section className="px-10 pb-28">
        <div className="mx-auto grid w-[1184px] max-w-full grid-cols-[repeat(auto-fill,272px)] justify-center gap-x-8 gap-y-12 [perspective:2400px]">
          {finds.map((b) => (
            <LinkCard
              key={b.id}
              url={b.url}
              title={cleanTitle(b.title, b.url)}
              image={pickCardImage(b.url, b.image_url, b.screenshot_url)}
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
            <a href="#" className="label text-black/45 transition-colors hover:text-ink">Extension</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
