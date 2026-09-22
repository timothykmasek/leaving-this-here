import { BulletinHeader } from '@/components/BulletinHeader'
import { MasonrySkeleton } from '@/components/MasonrySkeleton'

// Instant skeleton shown while the profile server component fetches. Mirrors the
// real chrome so client-side navigation between profiles feels immediate instead
// of stalling on a blank frame.
//
// "Mirrors" is load-bearing and easy to let rot: this drew a 1208-wide container
// of left-packed, near-square plates long after the profile had become a 1720
// grid with a CENTRED identity block over a masonry — so the page jumped as
// content arrived. Width, rhythm and block order below match ProfileClient.

const PROFILE_GRID = 'max-w-[1720px] px-4 sm:px-10'

export default function Loading() {
  return (
    <main className="min-h-screen">
      {/* Logo-only during load — auth state is unknown here, so don't flash
          "Sign in" at a signed-in owner viewing their own profile. */}
      <BulletinHeader
        action={null}
        logoClassName="h-[32px] sm:h-[44px]"
        widthClassName={PROFILE_GRID}
        stickyLogo
      />
      <div className={`mx-auto ${PROFILE_GRID} pb-40 pt-12 sm:pt-[88px]`}>
        {/* Identity block — CENTRED, like ProfileIdentity: name, one bio line,
            the "Latest Bullet" line, then the social row. */}
        <div className="mb-10 flex flex-col items-center gap-3 sm:mb-24">
          <div className="h-6 w-40 animate-pulse rounded bg-black/[0.07]" />
          <div className="flex flex-col items-center gap-2">
            <div className="h-3 w-64 animate-pulse rounded bg-black/[0.05]" />
            <div className="h-3 w-60 animate-pulse rounded bg-black/[0.05]" />
          </div>
          <div className="mt-1 flex items-center gap-4">
            <div className="h-4 w-4 animate-pulse rounded-full bg-black/[0.06]" />
            <div className="h-4 w-4 animate-pulse rounded-full bg-black/[0.06]" />
          </div>
        </div>

        {/* Lists section — heading bar, then a row of collection-card
            shapes at the real grid's metrics. */}
        <div className="mb-12 sm:mb-20">
          <div className="mb-8 h-6 w-24 animate-pulse rounded bg-black/[0.06] sm:mb-16" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-[295/393] w-full animate-pulse rounded-[20px] bg-black/[0.03] ${
                  i >= 2 ? 'hidden sm:block' : ''
                } ${i >= 3 ? 'sm:hidden lg:block' : ''}`}
              />
            ))}
          </div>
        </div>

        {/* Recent bullets section — heading bar, then the masonry. */}
        <div className="mb-8 h-6 w-44 animate-pulse rounded bg-black/[0.06] sm:mb-16" />
        <MasonrySkeleton />
      </div>
    </main>
  )
}
