'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SavePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      // Check auth
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      // Get profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      // Get URL and title from params
      const urlParam = searchParams.get('url')
      const titleParam = searchParams.get('title')

      setUrl(urlParam || '')
      setTitle(titleParam || '')
      setLoading(false)
    }

    init()
  }, [router, supabase, searchParams])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (!url) {
        setError('URL is required')
        return
      }

      // Fetch metadata from microlink
      const response = await fetch(
        `https://api.microlink.io?url=${encodeURIComponent(url)}`
      )
      const data = await response.json()

      const { data: inserted, error: insertError } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url,
        title: title || data.data?.title || url,
        description: data.data?.description,
        image_url: data.data?.image?.url,
        screenshot_url: data.data?.screenshot?.url,
        favicon_url: data.data?.logo?.url,
        tags: [],
      }).select('id').single()

      if (insertError) {
        if (insertError.code === '23505') {
          setError('you already saved this link')
        } else {
          setError(insertError.message)
        }
        return
      }

      // Generate embedding in the background (non-fatal)
      if (inserted?.id) {
        fetch('/api/embed-bookmark', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: inserted.id }),
        }).catch(() => {})
      }

      setSaved(true)

      // Auto-close after 1.5 seconds
      setTimeout(() => {
        window.close()
      }, 1500)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-light text-gray-900 mb-6 text-center">
          save this
        </h1>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              url
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-transparent text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 focus:border-transparent text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={saving || saved}
            className={`w-full px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 ${
              saved ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {saved ? 'saved!' : saving ? 'saving...' : 'save'}
          </button>
        </form>

        <p className="text-xs text-gray-500 text-center mt-6">
          {saved ? 'closing...' : 'this window will close automatically'}
        </p>
      </div>
    </div>
  )
}

export default function SavePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-500">loading...</p>
      </div>
    }>
      <SavePageInner />
    </Suspense>
  )
}
