'use client'

import { Suspense, useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// 4-step onboarding wizard. The first three load the user into the product;
// the fourth is just a congratulatory pause before redirecting to their folio.
//
//   1. Claim your handle   (creates the profile row)
//   2. Install save tool   (bookmarklet + mobile tip)
//   3. Your first save     (paste a URL, saves a bookmark, optional)
//   4. See your folio live (redirect)

type Step = 'handle' | 'tool' | 'first-save' | 'done'

export default function SetupPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <SetupInner />
    </Suspense>
  )
}

function SetupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  const [step, setStep] = useState<Step>('handle')
  const [userId, setUserId] = useState<string | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [username, setUsername] = useState(
    (searchParams?.get('handle') || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  )
  const [displayName, setDisplayName] = useState('')
  const [handleError, setHandleError] = useState<string | null>(null)
  const [handleLoading, setHandleLoading] = useState(false)

  const [firstSaveUrl, setFirstSaveUrl] = useState('')
  const [firstSaveBusy, setFirstSaveBusy] = useState(false)
  const [firstSaveError, setFirstSaveError] = useState<string | null>(null)

  // Auth guard + fast-path for existing profiles
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login?mode=signup')
        return
      }
      setUserId(user.id)

      const { data: existing } = await supabase
        .from('profiles')
        .select('id, username')
        .eq('id', user.id)
        .single()

      if (existing) {
        // Already has a profile — skip past handle, and if there are no
        // bookmarks yet, still walk them through tool + first save.
        setProfileId(existing.id)
        setUsername(existing.username)
        const { count } = await supabase
          .from('bookmarks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', existing.id)
        setStep(count && count > 0 ? 'done' : 'tool')
        if (count && count > 0) router.replace(`/${existing.username}`)
      }
    })
  }, [router, supabase])

  const claimHandle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return
    const handle = username.toLowerCase().trim()
    if (!handle) { setHandleError('pick a handle'); return }

    setHandleError(null)
    setHandleLoading(true)
    const name = displayName.trim() || handle

    const { data, error } = await supabase
      .from('profiles')
      .insert({ id: userId, username: handle, display_name: name, bio: null })
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') setHandleError('that handle is already taken')
      else setHandleError(error.message || 'something went wrong')
      setHandleLoading(false)
      return
    }
    setProfileId(data.id)
    setHandleLoading(false)
    setStep('tool')
  }

  const saveFirstLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!profileId) return
    const url = firstSaveUrl.trim()
    if (!url) return

    setFirstSaveBusy(true)
    setFirstSaveError(null)
    try {
      // Pull metadata from our own scraper
      const metaRes = await fetch('/api/fetch-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const meta = await metaRes.json()
      const ssUrl = `https://api.screenshotone.com/take?access_key=C3xT-xTVEXsWww&url=${encodeURIComponent(url)}&viewport_width=1280&viewport_height=900&format=webp&image_quality=90&block_ads=true&block_cookie_banners=true&block_chats=true&delay=2&cache=true&cache_ttl=86400`

      const { error } = await supabase.from('bookmarks').insert({
        user_id: profileId,
        url,
        title: meta.title || url,
        description: meta.description,
        image_url: meta.image || null,
        screenshot_url: ssUrl,
        favicon_url: meta.favicon,
        raw_metadata: meta.raw || null,
        tags: [],
        is_private: false,
      })
      if (error) throw new Error(error.message)
      setStep('done')
      setTimeout(() => router.push(`/${username}`), 1400)
    } catch (err: any) {
      setFirstSaveError(err?.message || 'something went wrong saving that link')
    } finally {
      setFirstSaveBusy(false)
    }
  }

  const skipFirstSave = () => {
    setStep('done')
    setTimeout(() => router.push(`/${username}`), 900)
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-md px-6 py-16">
        {/* Step indicator */}
        <div className="mb-10">
          <StepDots current={step} />
        </div>

        {step === 'handle' && (
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Claim your space.</h1>
            <p className="text-sm text-gray-500 mb-8">
              This is where your taste lives — a public URL anyone can subscribe to.
            </p>
            <form onSubmit={claimHandle} className="space-y-5">
              <div>
                <div className="flex items-stretch border border-gray-200 rounded-full bg-white overflow-hidden focus-within:ring-1 focus-within:ring-gray-400">
                  <span className="flex items-center pl-5 pr-1 text-sm text-gray-400 select-none">
                    leavingthishere.com/
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    placeholder="yourname"
                    autoFocus
                    autoComplete="off"
                    className="flex-1 py-3 pr-4 text-sm bg-transparent focus:outline-none"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5 px-1">lowercase, numbers, hyphens</p>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1.5">
                  display name <span className="normal-case text-gray-300">(optional)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="your real name, or whatever you want"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              </div>

              {handleError && <p className="text-sm text-red-600">{handleError}</p>}

              <button
                type="submit"
                disabled={handleLoading || !username.trim()}
                className="w-full px-5 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 disabled:opacity-60"
              >
                {handleLoading ? 'claiming...' : 'claim your folio →'}
              </button>
            </form>
          </div>
        )}

        {step === 'tool' && (
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Install the save tool.</h1>
            <p className="text-sm text-gray-500 mb-8">
              This is how you save links while browsing — one click from any page.
            </p>
            <div className="space-y-6">
              <div className="rounded-xl border border-gray-200 p-5">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">on desktop</p>
                <p className="text-sm text-gray-700 leading-relaxed mb-4">
                  Open the bookmarklet page, drag the button to your bookmarks bar. Takes 5 seconds.
                </p>
                <Link
                  href="/bookmarklet"
                  target="_blank"
                  className="inline-block text-sm font-medium text-gray-900 underline underline-offset-4"
                >
                  Open the bookmarklet page →
                </Link>
              </div>
              <div className="rounded-xl border border-gray-200 p-5">
                <p className="text-xs uppercase tracking-wider text-gray-400 mb-2">on mobile</p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  Use your browser&apos;s share sheet to save a link directly to your folio (rolling out — desktop first).
                </p>
              </div>
            </div>
            <button
              onClick={() => setStep('first-save')}
              className="mt-8 w-full px-5 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800"
            >
              installed — continue →
            </button>
            <button
              onClick={() => setStep('first-save')}
              className="mt-3 w-full text-sm text-gray-400 hover:text-gray-700"
            >
              I&apos;ll do it later
            </button>
          </div>
        )}

        {step === 'first-save' && (
          <div>
            <h1 className="text-3xl font-light text-gray-900 mb-2">Your first save.</h1>
            <p className="text-sm text-gray-500 mb-8">
              Paste a URL you&apos;ve been meaning to read. It&apos;ll appear on your folio — the
              page subscribers will see.
            </p>
            <form onSubmit={saveFirstLink} className="space-y-4">
              <input
                type="url"
                value={firstSaveUrl}
                onChange={(e) => setFirstSaveUrl(e.target.value)}
                placeholder="https://..."
                autoFocus
                disabled={firstSaveBusy}
                className="w-full px-5 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-gray-400 disabled:opacity-60"
              />
              <p className="text-xs text-gray-400 px-1">
                Saves are public by default. You can make any save private later.
              </p>
              {firstSaveError && <p className="text-sm text-red-600">{firstSaveError}</p>}
              <button
                type="submit"
                disabled={firstSaveBusy || !firstSaveUrl.trim()}
                className="w-full px-5 py-3 bg-gray-900 text-white rounded-full text-sm font-semibold hover:bg-gray-800 disabled:opacity-60"
              >
                {firstSaveBusy ? 'saving...' : 'publish to folio →'}
              </button>
              <button
                type="button"
                onClick={skipFirstSave}
                className="w-full text-sm text-gray-400 hover:text-gray-700"
              >
                skip for now
              </button>
            </form>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center pt-4">
            <h1 className="text-3xl font-light text-gray-900 mb-3">You&apos;re live.</h1>
            <p className="text-sm text-gray-500 mb-8 leading-relaxed">
              <span className="font-mono text-gray-700">leavingthishere.com/{username}</span>
              <br />
              is now your folio. Taking you there...
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function StepDots({ current }: { current: Step }) {
  const order: Step[] = ['handle', 'tool', 'first-save', 'done']
  const currentIdx = order.indexOf(current)
  return (
    <div className="flex items-center justify-center gap-2">
      {order.map((s, i) => (
        <span
          key={s}
          className={`h-1.5 rounded-full transition-all ${
            i <= currentIdx ? 'bg-gray-900 w-6' : 'bg-gray-200 w-3'
          }`}
        />
      ))}
    </div>
  )
}
