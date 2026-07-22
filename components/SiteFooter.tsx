'use client'

import { forwardRef } from 'react'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'

// Site footer — © + Privacy + extension link. Extracted from ProfileClient so
// list pages (and anything else) show the same footer instead of losing it off
// the profile.
//
// Two modes:
// - default: static in-flow footer (list pages, homepage).
// - `reveal`: fixed glassy bottom bar for the endless profile feed — hidden
//   off-canvas by default, slid in when `revealed` (driven by
//   lib/useRevealFooter's scroll-up detection). `focus-within` also reveals it
//   so keyboard users can tab to Privacy/Extension while it's tucked away.
export const SiteFooter = forwardRef<
  HTMLElement,
  { reveal?: boolean; revealed?: boolean }
>(function SiteFooter({ reveal = false, revealed = false }, ref) {
  const extInstalled = useExtensionInstalled()

  return (
    <footer
      ref={ref}
      className={
        reveal
          ? `fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-paper/90 px-6 pt-[18px] pb-[max(18px,env(safe-area-inset-bottom))] backdrop-blur-md transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] focus-within:translate-y-0 ${
              revealed ? 'translate-y-0' : 'translate-y-[110%]'
            }`
          : 'border-t border-black/[0.06] px-6 py-10'
      }
    >
      {/* Reveal bar stays a single slim row even on mobile; the static footer
          stacks © above the links on small screens like before. */}
      <div
        className={`mx-auto flex max-w-[1208px] items-center ${
          reveal ? 'flex-row justify-between' : 'flex-col gap-4 sm:flex-row sm:justify-between'
        }`}
      >
        <span className="label text-black/35">© 2026</span>
        <nav className="flex items-center gap-8">
          <a href="/import" className="label text-black/45 transition-colors hover:text-ink">Import</a>
          <a href="/privacy" className="label text-black/45 transition-colors hover:text-ink">Privacy</a>
          <a
            href="https://chromewebstore.google.com/detail/according-to-save-anything/dgpigmcmbffpoigjalnbgfmpgidoabgc"
            target="_blank"
            rel="noopener noreferrer"
            className="label text-black/45 transition-colors hover:text-ink"
          >
            {extInstalled === true ? 'Extension' : 'Get the extension'}
          </a>
        </nav>
      </div>
    </footer>
  )
})
