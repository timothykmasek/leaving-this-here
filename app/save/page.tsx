'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SavePageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [status, setStatus] = useState<'saving' | 'saved' | 'error'>('saving')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const doSave = async () => {
      try {
        // Check auth
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
          router.push('/login')
          return
        }

        // Get URL and title from params
        const urlParam = searchParams.get('url')
        if (!urlParam) {
          setError('No URL provided')
          setStatus('error')
          return
        }

        const titleParam = searchParams.get('title') || ''

        // Get profile
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (!profileData) {
          setError('Could not find profile')
          setStatus('error')
          return
        }

        // Fetch metadata from microlink
        const response = await fetch(
          `https://api.microlink.io?url=${encodeURIComponent(urlParam)}`
        )
        const data = await response.json()

        const { data: inserted, error: insertError } = await supabase
          .from('bookmarks')
          .insert({
            user_id: profileData.id,
            url: urlParam,
            title: titleParam || data.data?.title || urlParam,
            description: data.data?.description,
            image_url: data.data?.image?.url,
            screenshot_url: data.data?.screenshot?.url,
            favicon_url: data.data?.logo?.url,
          })
          .select('id')
          .single()

        if (insertError) {
          if (insertError.code === '23505') {
            setError('you already saved this link')
          } else {
            setError(insertError.message)
          }
          setStatus('error')
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

        setStatus('saved')

        // Auto-close after 1 second
        setTimeout(() => {
          window.close()
        }, 1000)
      } catch (err) {
        setError(String(err))
        setStatus('error')
      }
    }

    doSave()
  }, [router, supabase, searchParams])

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {status === 'saving' && (
          <div>
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-ink mb-4"></div>
            <p className="text-black/55">saving...</p>
          </div>
        )}
        {status === 'saved' && (
          <div>
            <p className="text-2xl mb-2">✓</p>
            <p className="text-black/55">saved to your bullets</p>
            <p className="text-xs text-black/40 mt-2">closing...</p>
          </div>
        )}
        {status === 'error' && (
          <div>
            <p className="text-2xl mb-2">✕</p>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={() => window.close()}
              className="text-xs text-black/45 hover:text-black/70 mt-4 underline"
            >
              close window
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function SavePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <p className="text-black/45">loading...</p>
      </div>
    }>
      <SavePageInner />
    </Suspense>
  )
}
