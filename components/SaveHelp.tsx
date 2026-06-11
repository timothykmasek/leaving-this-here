'use client'

import { useEffect, useState } from 'react'

// Inline "how to save faster" help, shown inside the profile save panel so the
// user never has to navigate to a separate page. Leads with the Chrome
// extension (one-click saving) and adapts its messaging to whether the
// extension is already installed. The bookmarklet is kept as a collapsible
// fallback for non-Chrome browsers.

// TODO: once the extension is published, set this to the Chrome Web Store URL
// and the CTA below will turn into a one-click "Add to Chrome" link.
const WEB_STORE_URL = ''

export function SaveHelp({ extInstalled }: { extInstalled: boolean | undefined }) {
  const [showBookmarklet, setShowBookmarklet] = useState(false)
  const [bookmarklet, setBookmarklet] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const origin = window.location.origin
    setBookmarklet(
      `javascript:(function(){const u=window.location.href;const t=document.title;window.open('${origin}/save?url='+encodeURIComponent(u)+'&title='+encodeURIComponent(t),'save_bookmark','width=400,height=500');})();`
    )
  }, [])

  const copy = () => {
    navigator.clipboard.writeText(bookmarklet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-5 border-t border-gray-200 pt-5">
      {extInstalled ? (
        // Installed → quiet confirmation, no nagging.
        <p className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-emerald-600" aria-hidden>
            ✓
          </span>
          Chrome extension installed — click the according to icon on any page
          to save it instantly.
        </p>
      ) : (
        <div>
          <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">
            save with one click
          </p>
          <p className="text-sm text-gray-700 mb-3">
            Add the according to extension to Chrome to grab any page, image,
            or quote with one click — no pasting URLs.
          </p>

          {WEB_STORE_URL ? (
            <a
              href={WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
            >
              Add to Chrome →
            </a>
          ) : (
            <ol className="space-y-1.5 text-sm text-gray-600">
              <li>
                <strong className="text-gray-900">1.</strong> open{' '}
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">
                  chrome://extensions
                </code>{' '}
                and turn on <strong className="text-gray-900">Developer mode</strong>
              </li>
              <li>
                <strong className="text-gray-900">2.</strong> click{' '}
                <strong className="text-gray-900">Load unpacked</strong> and
                select the <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs">extension</code> folder
              </li>
              <li>
                <strong className="text-gray-900">3.</strong> pin the according
                to icon — now one click saves the page you're on
              </li>
            </ol>
          )}
        </div>
      )}

      {/* Bookmarklet — collapsible fallback for non-Chrome browsers. */}
      <button
        onClick={() => setShowBookmarklet((v) => !v)}
        className="mt-4 text-xs text-gray-400 underline underline-offset-4 hover:text-gray-700"
      >
        {showBookmarklet ? 'hide' : 'not on Chrome? use the bookmarklet instead'}
      </button>
      {showBookmarklet && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50/60 p-4">
          <p className="text-sm text-gray-600 mb-3">
            Drag this button to your bookmarks bar, then click it on any page:
          </p>
          <a
            href={bookmarklet}
            onClick={(e) => e.preventDefault()}
            className="inline-block cursor-grab rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white active:cursor-grabbing"
          >
            save
          </a>
          <button
            onClick={copy}
            className="ml-3 text-xs text-gray-500 underline underline-offset-4 hover:text-gray-800"
          >
            {copied ? '✓ copied code' : 'or copy the code'}
          </button>
        </div>
      )}
    </div>
  )
}
