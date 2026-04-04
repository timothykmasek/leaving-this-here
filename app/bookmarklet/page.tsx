'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function BookmarkletPage() {
  const [bookmarkletCode, setBookmarkletCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const origin = window.location.origin
    const code = `javascript:(function(){var url=encodeURIComponent(window.location.href);var title=encodeURIComponent(document.title);window.open('${origin}/save?url='+url+'&title='+title,'lth','width=400,height=300')})();`
    setBookmarkletCode(code)
  }, [])

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900 mb-2">save from anywhere</h1>
          <p className="text-gray-500 text-sm">drag the button below to your bookmarks bar to save links while browsing</p>
        </div>

        <div className="space-y-8">
          <div className="border border-gray-100 rounded-lg p-8">
            <p className="text-sm text-gray-500 mb-4">1. drag this button to your bookmarks bar</p>
            <a
              href={bookmarkletCode}
              className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors cursor-grab active:cursor-grabbing text-sm"
              onClick={(e) => e.preventDefault()}
            >
              ✚ leaving this here
            </a>
            <p className="text-xs text-gray-400 mt-4">or right-click → "Bookmark This Link"</p>
          </div>

          <div className="border border-gray-100 rounded-lg p-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">how it works</h2>
            <ol className="space-y-3 text-sm text-gray-500">
              <li><strong className="text-gray-900">1.</strong> click the bookmark while on any page</li>
              <li><strong className="text-gray-900">2.</strong> a small popup confirms the save</li>
              <li><strong className="text-gray-900">3.</strong> it appears on your profile automatically</li>
            </ol>
          </div>

          <div className="border border-gray-100 rounded-lg p-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">or copy the code</h2>
            <div className="bg-gray-50 p-4 rounded border border-gray-100 mb-4 font-mono text-xs overflow-x-auto">
              {bookmarkletCode}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(bookmarkletCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 hover:border-gray-400 transition-colors"
            >
              {copied ? '✓ copied' : 'copy code'}
            </button>
          </div>

          <div className="text-center pt-8 border-t border-gray-100">
            <Link href="/discover" className="text-sm text-gray-400 hover:text-gray-900">← back to discover</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
