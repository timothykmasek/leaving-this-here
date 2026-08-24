import { BulletinHeader } from '@/components/BulletinHeader'
import { MasonrySkeleton } from '@/components/MasonrySkeleton'

// Instant skeleton while the public list server component fetches — mirrors the
// list page chrome so a shared link feels immediate instead of blank.
//
// It has to mirror the CURRENT page, which is the whole point of a skeleton and
// the easy thing to let rot: this drew a 1208-wide container of near-square
// plates long after the list page had become a 1720 grid with a cover masthead
// over a masonry, so the page visibly re-laid-out the moment content arrived.
// Width, rhythm and block order below all match app/[username]/[listSlug]/page.

const LIST_GRID = 'max-w-[1720px] px-4 sm:px-10'

export default function Loading() {
  return (
    <main className="min-h-screen">
      {/* Logo-only during load — auth state is unknown here, so don't guess
          "Sign in" and flash the wrong action at a signed-in owner. */}
      <BulletinHeader
        action={null}
        logoClassName="h-[32px] sm:h-[44px]"
        widthClassName={LIST_GRID}
        stickyLogo
      />
      <div className={`mx-auto ${LIST_GRID} pb-16 pt-4 sm:pt-8`}>
        <div className="pt-2">
          {/* back link */}
          <div className="h-3 w-28 animate-pulse rounded bg-black/[0.05]" />

          {/* Cover. Every list has one now — the default band if nothing was
              chosen — so the skeleton reserves its box at the band cover's
              height rather than dropping the reader straight into cards. */}
          <div className="mt-6 aspect-[1184/480] max-h-[360px] w-full animate-pulse rounded-[20px] bg-card" />

          {/* description (cols 1–2) opposite the meta stack (last column) */}
          <div className="mt-8 grid grid-cols-1 gap-y-6 border-b border-black/[0.06] pb-8 sm:grid-cols-3 sm:gap-x-[40px] lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
              <div className="h-3 w-full animate-pulse rounded bg-black/[0.05]" />
              <div className="h-3 w-[92%] animate-pulse rounded bg-black/[0.05]" />
              <div className="h-3 w-[64%] animate-pulse rounded bg-black/[0.05]" />
            </div>
            <div className="flex flex-col gap-2 sm:col-start-3 sm:items-end lg:col-start-4">
              <div className="h-3 w-24 animate-pulse rounded bg-black/[0.05]" />
              <div className="h-3 w-16 animate-pulse rounded bg-black/[0.05]" />
              <div className="h-3 w-44 animate-pulse rounded bg-black/[0.05]" />
            </div>
          </div>
        </div>

        <MasonrySkeleton />
      </div>
    </main>
  )
}
