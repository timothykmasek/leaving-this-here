'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { BulletinHeader } from '@/components/BulletinHeader'

export default function BookmarkletPage() {
  const supabase = createClient()
  const [bookmarkletCode, setBookmarkletCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    // Use the current origin so the bookmarklet self-configures regardless of
    // which domain the app is deployed on.
    const origin = window.location.origin
    const code = `javascript:(function(){const url=window.location.href;const title=document.title;window.open('${origin}/save?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title),'save_bookmark','width=400,height=500');})();`
    setBookmarkletCode(code)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen bg-paper">
      <BulletinHeader action={null} logoClassName="h-[26px] sm:h-[34px]" />
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-4 sm:px-6">
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-ink mb-2">
            save finds from anywhere
          </h1>
          <p className="text-black/55 text-sm">
            drag the button below to your bookmarks bar to save finds while
            browsing
          </p>
        </div>

        <div className="space-y-8">
          {/* Bookmarklet button */}
          <div className="border border-black/15 rounded-lg p-8">
            <p className="text-sm text-black/55 mb-4">
              1. right-click the button below and select "bookmark this link"
            </p>
            <a
              href={bookmarkletCode}
              className="inline-block px-6 py-3 bg-ink text-white rounded-lg font-medium hover:bg-black transition-colors cursor-grab active:cursor-grabbing"
              onClick={(e) => e.preventDefault()}
            >
              save
            </a>
            <p className="text-xs text-black/45 mt-4">
              then name it &ldquo;save&rdquo;
            </p>
          </div>

          {/* How it works */}
          <div className="border border-black/15 rounded-lg p-8">
            <h2 className="text-lg font-medium text-ink mb-4">
              how it works
            </h2>
            <ol className="space-y-3 text-sm text-black/55">
              <li>
                <strong className="text-ink">1.</strong> click the button
                while browsing any page
              </li>
              <li>
                <strong className="text-ink">2.</strong> review and
                confirm the bookmark
              </li>
              <li>
                <strong className="text-ink">3.</strong> it appears in
                your collection automatically
              </li>
            </ol>
          </div>

          {/* Manual code */}
          <div className="border border-black/15 rounded-lg p-8">
            <h2 className="text-lg font-medium text-ink mb-4">
              or add manually
            </h2>
            <p className="text-sm text-black/55 mb-4">
              if the bookmarklet approach doesn't work, copy this code:
            </p>
            <div className="bg-black/[0.03] p-4 rounded border border-black/15 mb-4 font-mono text-xs overflow-x-auto">
              {bookmarkletCode}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-black/20 rounded-lg text-sm font-medium text-ink hover:border-black/40 transition-colors"
            >
              {copied ? '✓ copied' : 'copy code'}
            </button>
          </div>

          <div className="text-center pt-8 border-t border-black/15">
            <Link
              href="/"
              className="text-sm text-black/55 hover:text-ink"
            >
              ← back home
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
