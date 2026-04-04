'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SavePage() {
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const saveBookmark = async () => {
      const urlParam = searchParams.get('url')
      if (!urlParam) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setError('not signed in')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setError('no profile found')
        return
      }

      setSaving(true)

      try {
        // Fetch metadata
        const res = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlParam)}`)
        const meta = await res.json()

        const { error: insertError } = await supabase.from('bookmarks').insert({
          user_id: profile.id,
          url: urlParam,
          title: searchParams.get('title') || meta.data?.title || urlParam,
          description: meta.data?.description,
          image_url: meta.data?.image?.url,
          screenshot_url: meta.data?.screenshot?.url,
          favicon_url: meta.data?.logo?.url,
          tags: [],
        })

        if (insertError) {
          if (insertError.code === '23505') {
            setError('already saved')
          } else {
            setError(insertError.message)
          }
          return
        }

        setSaved(true)
        setTimeout(() => window.close(), 1200)
      } catch (err: any) {
        setError(err.message || 'failed to save')
      } finally {
        setSaving(false)
      }
    }

    saveBookmark()
  }, [searchParams, supabase])

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="text-center">
        {saving && <p className="text-gray-500">saving...</p>}
        {saved && <p className="text-gray-900 font-medium">left it here ✓</p>}
        {error && <p className="text-red-600 text-sm">{error}</p>}
      </div>
    </div>
  )
}
