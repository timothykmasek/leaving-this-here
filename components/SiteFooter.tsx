'use client'

import { forwardRef } from 'react'
import { useExtensionInstalled } from '@/lib/useExtensionInstalled'

// Site footer — © + Privacy + extension link. Extracted from ProfileClient so
// list pages (and anything else) show the same footer instead of losing it off
// the profile. forwardRef because the profile's floating search pill watches
// the footer with an IntersectionObserver to avoid overlapping it.
export const SiteFooter = forwardRef<HTMLElement, {}>(function SiteFooter(_, ref) {
  const extInstalled = useExtensionInstalled()

  return (
    <footer ref={ref} className="border-t border-black/[0.06] px-6 py-10">
      <div className="mx-auto flex max-w-[1208px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <span className="label text-black/35">© 2026</span>
        <nav className="flex items-center gap-8">
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
