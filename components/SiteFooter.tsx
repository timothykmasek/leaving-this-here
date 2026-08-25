'use client'

import { forwardRef, useEffect, useState } from 'react'
import { CHROME_STORE_URL } from '@/lib/extension'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// Site footer — © + Privacy + extension link, plus Import when there is
// somebody to import for. Extracted from ProfileClient so list pages (and
// anything else) show the same footer instead of losing it off the profile.
//
// Import is signed-in only, everywhere including the homepage: /import
// redirects a signed-out visitor to /login, so offering it to them was a link
// that answered a different question than the one it asked.
//
// Two modes:
// - default: static in-flow footer (list pages, homepage).
// - `reveal`: fixed glassy bottom bar for the endless profile feed — hidden
//   off-canvas by default, slid in when `revealed` (driven by
//   lib/useRevealFooter's scroll-up detection). `focus-within` also reveals it
//   so keyboard users can tab to Privacy/Extension while it's tucked away.
export const SiteFooter = forwardRef<
  HTMLElement,
  { reveal?: boolean; revealed?: boolean; widthClassName?: string }
>(function SiteFooter(
  // widthClassName must match the page's grid, or the footer row sits inside
  // (or outside) the column edges above it. Defaults to the 1208 grid.
  { reveal = false, revealed = false, widthClassName = 'max-w-[1208px] px-6' },
  ref,
) {
  // Starts false so a signed-out reader never sees Import flash and vanish; a
  // signed-in one gets it a tick later instead. getSession is a local JWT
  // decode, not a network call — same pattern as Header.
  const [signedIn, setSignedIn] = useState(false)
  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getSession()
      .then(({ data: { session } }) => {
        if (!cancelled) setSignedIn(!!session?.user)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <footer
      ref={ref}
      className={
        reveal
          ? `fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-paper/90 pt-[18px] pb-[max(18px,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:translate-y-0 ${
              revealed ? 'translate-y-0' : 'translate-y-[110%]'
            }`
          : // bg-paper, not transparent. The page's dot grid is painted by a
            // fixed ::before behind everything, so a footer with no background
            // let the dots run straight through it — while the reveal bar above
            // sits on bg-paper/90 and reads as a solid white band. Two
            // treatments for one piece of furniture.
            //
            // Solid here rather than /90: the reveal bar is translucent because
            // it floats OVER cards and has to admit there is something beneath
            // it. This one sits at the end of the page with nothing behind it
            // but ground, so translucency would only let the dots back in.
            'border-t border-black/[0.06] bg-paper py-10'
      }
    >
      {/* Both modes render one slim justified row, on mobile too, so the static
          footer (list pages) reads identically to the reveal bar (profile feed)
          — no stacked-© variant that looked inconsistent across screens. */}
      <div className={`mx-auto flex ${widthClassName} flex-row items-center justify-between`}>
        <span className="label whitespace-nowrap text-black/35">© 2026</span>
        {/* Tight gap so © + every link fits one row on a 375px phone without any
            item wrapping onto a second line — three links when signed in. */}
        <nav className="flex items-center gap-5 sm:gap-8">
          {signedIn && (
            <Link href="/import" className="label whitespace-nowrap text-black/45 transition-colors hover:text-ink">Import</Link>
          )}
          <Link href="/privacy" className="label whitespace-nowrap text-black/45 transition-colors hover:text-ink">Privacy</Link>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="label whitespace-nowrap text-black/45 transition-colors hover:text-ink"
          >
            Extension
          </a>
        </nav>
      </div>
    </footer>
  )
})
