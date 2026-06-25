import { BulletinHeader } from '@/components/BulletinHeader'

// Instant skeleton shown while the profile server component fetches. Mirrors the
// real chrome (header + paper bg + card grid) so client-side navigation between
// profiles feels immediate instead of stalling on a blank frame.
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper">
      <BulletinHeader action={{ label: 'Sign in', href: '/login' }} logoClassName="h-[26px] sm:h-[34px]" />
      <div className="mx-auto max-w-[1208px] px-4 pb-28 pt-8 sm:px-6 sm:pt-16">
        {/* hero strip placeholder */}
        <div className="mb-9 space-y-3">
          <div className="h-4 w-40 animate-pulse rounded bg-black/[0.07]" />
          <div className="h-3 w-64 animate-pulse rounded bg-black/[0.05]" />
        </div>
        {/* card grid skeleton — same grid template as the real page */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[272/270] w-full animate-pulse rounded-[20px] bg-card" />
          ))}
        </div>
      </div>
    </main>
  )
}
