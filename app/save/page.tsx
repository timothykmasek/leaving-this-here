'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type SaveState = 'loading' | 'saving' | 'saved' | 'already' | 'signed-out' | 'error'

function SaveFlow() {
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [state, setState] = useState<SaveState>('loading')
  const [urlLabel, setUrlLabel] = useState('')

  useEffect(() => {
    const run = async () => {
      const urlParam = searchParams.get('url')
      if (!urlParam) { setState('error'); return }

      // Show a readable version of the URL while saving
      try { setUrlLabel(new URL(urlParam).hostname.replace('www.', '')) } catch { setUrlLabel(urlParam) }

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setState('signed-out'); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .single()

      if (!profile) { setState('error'); return }

      setState('saving')

      // Save immediately with just the URL — feels instant
      const { data: inserted, error: insertError } = await supabase.from('bookmarks').insert({
        user_id: profile.id,
        url: urlParam,
        title: searchParams.get('title') || urlParam,
        tags: [],
      }).select().single()

      if (insertError) {
        if (insertError.code === '23505') {
          setState('already')
          setTimeout(() => window.close(), 1500)
        } else {
          setState('error')
        }
        return
      }

      // Show success right away
      setState('saved')
      setTimeout(() => window.close(), 1500)

      // Enrich in the background (metadata + AI tags)
      if (inserted) {
        try {
          const metaRes = await fetch(`https://api.microlink.io?url=${encodeURIComponent(urlParam)}`)
          const meta = await metaRes.json()

          // AI tags
          let tags: string[] = []
          try {
            const tagRes = await fetch('/api/generate-tags', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: urlParam,
                title: meta.data?.title || null,
                description: meta.data?.description || null,
              }),
            })
            const tagData = await tagRes.json()
            tags = tagData.tags || []
          } catch {}

          await supabase.from('bookmarks').update({
            title: meta.data?.title || urlParam,
            description: meta.data?.description || null,
            image_url: meta.data?.image?.url || null,
            favicon_url: meta.data?.logo?.url || null,
            tags,
          }).eq('id', inserted.id)
        } catch {}
      }
    }

    run()
  }, [searchParams, supabase])

  return (
    <div className="min-h-screen bg-neutral-50/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 px-8 py-6 max-w-xs w-full text-center">
        {state === 'loading' && (
          <p className="text-sm text-neutral-400">loading...</p>
        )}

        {state === 'saving' && (
          <>
            <div className="flex justify-center mb-3">
              <div className="w-5 h-5 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-neutral-700">Saving</p>
            {urlLabel && <p className="text-xs text-neutral-400 mt-1">{urlLabel}</p>}
          </>
        )}

        {state === 'saved' && (
          <>
            <div className="flex justify-center mb-3">
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <p className="text-sm font-medium text-neutral-700">Saved</p>
            {urlLabel && <p className="text-xs text-neutral-400 mt-1">{urlLabel}</p>}
          </>
        )}

        {state === 'already' && (
          <>
            <p className="text-sm font-medium text-neutral-700">Already saved</p>
            {urlLabel && <p className="text-xs text-neutral-400 mt-1">{urlLabel}</p>}
          </>
        )}

        {state === 'signed-out' && (
          <>
            <p className="text-sm font-medium text-neutral-700">Sign in first</p>
            <a href="/" className="text-xs text-blue-500 hover:underline mt-2 inline-block">Go to leaving this here</a>
          </>
        )}

        {state === 'error' && (
          <p className="text-sm text-red-500">Something went wrong</p>
        )}
      </div>
    </div>
  )
}

export default function SavePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-neutral-50/80 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-neutral-200 px-8 py-6 max-w-xs w-full text-center">
          <p className="text-sm text-neutral-400">loading...</p>
        </div>
      </div>
    }>
      <SaveFlow />
    </Suspense>
  )
}
