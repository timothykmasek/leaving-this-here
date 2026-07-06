import { BulletinHeader } from '@/components/BulletinHeader'

// Instant skeleton while the public list server component fetches — mirrors the
// list page chrome so a shared link feels immediate instead of blank.
export default function Loading() {
  return (
    <main className="min-h-screen bg-paper">
      {/* Logo-only during load — auth state is unknown here, so don't guess
          "Sign in" and flash the wrong action at a signed-in owner. */}
      <BulletinHeader action={null} logoClassName="h-[26px] sm:h-[34px]" />
      <div className="mx-auto max-w-[1208px] px-4 pb-16 pt-8 sm:px-6 sm:pt-16">
        <div className="mb-8 border-b border-gray-100 pb-6 sm:mb-10 sm:pb-8">
          <div className="h-3 w-24 animate-pulse rounded bg-black/[0.06]" />
          <div className="mt-3 h-6 w-56 animate-pulse rounded bg-black/[0.07]" />
          <div className="mt-3 h-3 w-72 animate-pulse rounded bg-black/[0.05]" />
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[272/270] w-full animate-pulse rounded-[20px] bg-card" />
          ))}
        </div>
      </div>
    </main>
  )
}
