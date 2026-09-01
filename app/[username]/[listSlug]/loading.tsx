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

          {/* Poster title — one bar at the display type's own line box
              (clamp(52→180px) × 1.22 leading), so the name lands in a slot
              already its size. Cover and description skeletons went with the
              cover and the description. */}
          <div className="mt-6 h-[clamp(63px,16.5vw,220px)] w-[72%] animate-pulse rounded-[20px] bg-black/[0.05] sm:mt-12" />

          {/* meta row: count left, owner's delete slot right */}
          <div className="mt-10 flex items-center justify-between pb-8 sm:mt-24">
            <div className="h-3 w-16 animate-pulse rounded bg-black/[0.05]" />
            <div className="h-3 w-14 animate-pulse rounded bg-black/[0.05]" />
          </div>
        </div>

        <MasonrySkeleton />
      </div>
    </main>
  )
}
