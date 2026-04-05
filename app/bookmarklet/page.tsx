'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function BookmarkletPage() {
  const supabase = createClient()
  const [bookmarkletCode, setBookmarkletCode] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const origin = 'https://leaving-this-here.vercel.app'
    const code = `javascript:(function(){const url=window.location.href;const title=document.title;window.open('${origin}/save?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title),'save_bookmark','width=400,height=500');})();`
    setBookmarkletCode(code)
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(bookmarkletCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-light text-gray-900 mb-2">
            save from anywhere
          </h1>
          <p className="text-gray-600 text-sm">
            drag the button below to your bookmarks bar to save links while
            browsing
          </p>
        </div>

        <div className="space-y-8">
          {/* Bookmarklet button */}
          <div className="border border-gray-200 rounded-lg p-8">
            <p className="text-sm text-gray-600 mb-4">
              1. right-click the button below and select "bookmark this link"
            </p>
            <a
              href={bookmarkletCode}
              className="inline-block px-6 py-3 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors cursor-grab active:cursor-grabbing"
              onClick={(e) => e.preventDefault()}
            >
              + leaving this here
            </a>
            <p className="text-xs text-gray-500 mt-4">
              then name it something like "save" for quick access
            </p>
          </div>

          {/* How it works */}
          <div className="border border-gray-200 rounded-lg p-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              how it works
            </h2>
            <ol className="space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-900">1.</strong> click the button
                while browsing any page
              </li>
              <li>
                <strong className="text-gray-900">2.</strong> review and
                confirm the bookmark
              </li>
              <li>
                <strong className="text-gray-900">3.</strong> it appears on
                your profile automatically
              </li>
            </ol>
          </div>

          {/* Manual code */}
          <div className="border border-gray-200 rounded-lg p-8">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              or add manually
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              if the bookmarklet approach doesn't work, copy this code:
            </p>
            <div className="bg-gray-50 p-4 rounded border border-gray-200 mb-4 font-mono text-xs overflow-x-auto">
              {bookmarkletCode}
            </div>
            <button
              onClick={handleCopy}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-900 hover:border-gray-400 transition-colors"
            >
              {copied ? 'â copied' : 'copy code'}
            </button>
          </div>

          <div className="text-center pt-8 border-t border-gray-200">
            <Link
              href="/discover"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              â back to discover
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
