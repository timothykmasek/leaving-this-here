'use client'

import { useEffect, useState } from 'react'
import { CHROME_STORE_URL } from '@/lib/extension'

// Owner-only nudge to install the extension, shown on their own profile when
// detection has POSITIVELY said it's not there (extInstalled === false —
// never while still undefined, so people who have it see nothing, not even a
// flash). Dismissing snoozes it for 14 days rather than forever: a nudge, not
// a nag, but new-laptop / second-browser cases resurface eventually.

const SNOOZE_KEY = 'bulletin-ext-nudge-snoozed-at'
const SNOOZE_DAYS = 14

export function ExtensionNudge({ extInstalled }: { extInstalled: boolean | undefined }) {
  const [snoozed, setSnoozed] = useState(true) // assume snoozed until read — no flash

  useEffect(() => {
    try {
      const at = Number(localStorage.getItem(SNOOZE_KEY) || 0)
      setSnoozed(Date.now() - at < SNOOZE_DAYS * 86400_000)
    } catch {
      setSnoozed(false)
    }
  }, [])

  if (extInstalled !== false || snoozed) return null

  const dismiss = () => {
    setSnoozed(true)
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()))
    } catch {}
  }

  return (
    // Same geometry as PreviewBanner — one quiet line in a tinted strip, the
    // action as an inline text link rather than button chrome.
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-black/[0.08] bg-black/[0.02] px-4 py-3">
      {/* The bullet dot — same motif as the tab strip's Recent marker. */}
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-black/30" />
      <p className="font-sans text-sm text-black/60">
        Save any page in one click.
        <a
          href={CHROME_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2.5 font-[600] text-ink underline decoration-black/20 underline-offset-2 transition-colors hover:decoration-black/60"
        >
          Add to Chrome
        </a>
      </p>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="ml-auto shrink-0 p-1 text-black/25 transition-colors hover:text-ink"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
