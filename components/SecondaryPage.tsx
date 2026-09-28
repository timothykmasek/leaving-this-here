import { BulletinHeader } from '@/components/BulletinHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { BackLink } from '@/components/BackLink'

// The frame every secondary page (Privacy, Claude, Settings, Import) shares, so
// they stop reading as phone layouts parked in the middle of a desktop:
//
// - Header and footer ride the SAME 1720 frame as the profile and list pages,
//   so the footer is one width site-wide. (It used to follow each page's text
//   column: full-bleed on a profile, a 672px huddle on Privacy.)
// - The reading column is 760 — a comfortable measure, wider than the old 672
//   phone column — and centred inside that frame.
// - One "← back" in one place, one top rhythm.
//
// Works from server and client pages alike (ImportClient renders it).
export const SECONDARY_FRAME = 'max-w-[1720px] px-4 sm:px-10'

// Shared type for page titles so the four pages don't drift apart again.
export const SECONDARY_TITLE =
  'font-sans text-3xl font-bold tracking-tight text-ink sm:text-[40px] sm:leading-[1.1]'

export function SecondaryPage({
  action = null,
  backHref,
  children,
}: {
  action?: { label: string; href?: string; onClick?: () => void } | null
  // Where "← back" goes when there's no Bulletin page behind this one.
  backHref: string
  children: React.ReactNode
}) {
  return (
    <main className="flex min-h-screen flex-col">
      <BulletinHeader action={action} logoClassName="h-[32px] sm:h-[44px]" widthClassName={SECONDARY_FRAME} />
      <div className={`mx-auto w-full ${SECONDARY_FRAME} flex-1`}>
        <div className="mx-auto w-full max-w-[760px] pb-20 pt-6 sm:pb-28 sm:pt-12">
          <BackLink fallbackHref={backHref} className="mb-8 sm:mb-10" />
          {children}
        </div>
      </div>
      <SiteFooter widthClassName={SECONDARY_FRAME} />
    </main>
  )
}
