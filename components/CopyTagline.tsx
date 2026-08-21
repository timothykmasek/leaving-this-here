'use client'

import { useEffect, useRef, useState } from 'react'

// The profile masthead tagline ("A home for Tim's links"), made into a copy
// affordance: click the line, get the profile's URL on the clipboard.
//
// Its own client component rather than state inside BulletinHeader, because the
// header is imported by server components too (the /preview pages), and a
// useState in that module would force every one of them client-side.

function CopyGlyph({ copied }: { copied: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center transition-colors ${
        copied ? 'text-ink/60' : 'text-black/25 group-hover:text-black/55'
      }`}
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-full w-full">
          <rect x="9" y="9" width="11" height="11" rx="2.5" />
          <path d="M6.5 15H5.5A2.5 2.5 0 0 1 3 12.5v-7A2.5 2.5 0 0 1 5.5 3h7A2.5 2.5 0 0 1 15 5.5v1" />
        </svg>
      )}
    </span>
  )
}

export function CopyTagline({
  children,
  path,
}: {
  children: React.ReactNode
  /** Profile path, e.g. "/tim". Resolved against the live origin at click time
   *  so it's right on localhost, previews and production alike. */
  path: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Don't leave a timeout to fire into an unmounted component.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  async function copy() {
    const url = `${window.location.origin}${path}`
    let ok = false
    try {
      await navigator.clipboard.writeText(url)
      ok = true
    } catch {
      // navigator.clipboard needs a secure context and can be permission-denied.
      // The textarea fallback keeps this working on plain-http dev hosts.
      const ta = document.createElement('textarea')
      ta.value = url
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { ok = document.execCommand('copy') } catch { ok = false }
      document.body.removeChild(ta)
    }
    // Only confirm a copy that actually happened — a checkmark over an empty
    // clipboard is worse than no feedback, because the user stops checking.
    if (!ok) return
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1800)
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy link to this profile"
      className="group inline-flex items-center gap-1.5 transition-colors hover:text-black/70"
    >
      <span>{children}</span>
      <CopyGlyph copied={copied} />
      {/* Announced to screen readers; the icon swap is the visual half. */}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Profile link copied' : ''}
      </span>
    </button>
  )
}
