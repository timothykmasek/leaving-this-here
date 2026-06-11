'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

// "You're live" banner — shown once, right after onboarding lands the user on
// their brand-new page (?welcome=1). Self-contained: reads the query param
// itself so the profile page just renders <WelcomeBanner />.

export function WelcomeBanner() {
  return (
    <Suspense fallback={null}>
      <WelcomeBannerInner />
    </Suspense>
  )
}

function WelcomeBannerInner() {
  const searchParams = useSearchParams()
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (searchParams?.get('welcome') !== '1' || dismissed) return null

  const copy = () => {
    try {
      navigator.clipboard.writeText(window.location.href.split('?')[0])
    } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-emerald-800/20 bg-emerald-50/80 px-4 py-3">
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
      </span>
      <p className="flex-1 text-sm text-emerald-950">
        Your page is <b>live</b> — this is the real thing. Click anything to edit it.
      </p>
      <button
        onClick={copy}
        className="shrink-0 rounded-full border border-emerald-800/30 px-3 py-1 text-xs text-emerald-900 hover:bg-emerald-100 transition-colors"
      >
        {copied ? 'link copied ✓' : 'copy link'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 text-emerald-900/50 hover:text-emerald-900"
      >
        ×
      </button>
    </div>
  )
}
