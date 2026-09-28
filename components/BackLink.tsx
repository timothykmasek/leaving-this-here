'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BracketLabel } from '@/components/BulletinHeader'

// "← back" that means back: returns to whatever Bulletin page you came from
// (Privacy from a list, Settings from someone else's profile), and only falls
// back to `fallbackHref` when there is no in-app page behind this one — a
// fresh tab, or arriving from outside. Same BracketLabel dress as the list
// masthead's back link.
//
// Deciding "is the previous entry ours": the Navigation API lists only this
// origin's entries, so currentEntry.index > 0 means a Bulletin page sits
// behind us. Browsers without it fall back to a same-origin referrer, which
// covers full-page arrivals but not client transitions (those keep the
// first page's referrer) — in that case the fallback href is still sane.
function hasInAppHistory(): boolean {
  const nav = (window as unknown as { navigation?: { currentEntry?: { index: number } } }).navigation
  if (nav?.currentEntry) return nav.currentEntry.index > 0
  try {
    return !!document.referrer && new URL(document.referrer).origin === window.location.origin
  } catch {
    return false
  }
}

export function BackLink({ fallbackHref, className = '' }: { fallbackHref: string; className?: string }) {
  const router = useRouter()
  return (
    <Link
      href={fallbackHref}
      onClick={(e) => {
        // Modified clicks (new tab, etc.) keep the plain href.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        if (!hasInAppHistory()) return
        e.preventDefault()
        router.back()
      }}
      className={`inline-flex text-black/30 transition-colors hover:text-ink ${className}`}
    >
      <BracketLabel>&larr; back</BracketLabel>
    </Link>
  )
}
