'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { BulletinHeader } from '@/components/BulletinHeader'

// Private-beta door: Google only. Accounts are pre-created by the invite
// script with no password, so a password form could only fail for a beta
// user — it lives on behind ?pw=1 for the password-only demo personas
// (hugh/ellie) and nobody else. "Sign up" during the beta means the
// landing page's request-access capture, so that's where it points.

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LoginPageInner />
    </Suspense>
  )
}

const inputClass =
  'w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm text-ink placeholder:text-black/40 focus:border-black/40 focus:outline-none'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const showPw = searchParams?.get('pw') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(
    // Set by /auth/callback when the OAuth round-trip fails. invite_only is
    // Supabase refusing to mint an account (signups off, email not on the
    // guest list); auth_failed is everything else.
    searchParams?.get('error') === 'invite_only'
      ? 'That Google account isn’t on the guest list yet — Bulletin is invite-only right now.'
      : searchParams?.get('error') === 'auth_failed'
        ? 'Sign-in didn’t go through — mind trying again?'
        : null
  )

  const supabase = createClient()

  // Old /login?mode=signup links: signup during the beta is the landing
  // page's request-access capture.
  useEffect(() => {
    if (searchParams?.get('mode') === 'signup') router.replace('/')
  }, [searchParams, router])

  const handlePasswordSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message.includes('Invalid login') ? 'email or password is incorrect' : error.message)
      } else {
        router.push('/')
        router.refresh()
      }
    } catch (err: any) {
      setError(err.message || 'something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleAuth = async () => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
  }

  return (
    <main className="flex min-h-screen flex-col">
      <BulletinHeader action={null} logoClassName="h-[32px] sm:h-[44px]" />
      <div className="flex flex-1 items-center justify-center px-4 pb-20 pt-6">
        <div className="w-full max-w-md">
          <h1 className="mb-8 text-center font-sans text-[24px] font-normal text-ink">
            Welcome back
          </h1>

          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="label w-full rounded-full bg-ink px-6 py-3.5 text-paper transition-colors hover:bg-black disabled:opacity-60"
          >
            Continue with Google
          </button>

          {error && !showPw && <p className="mt-4 text-center text-sm text-[#a31f34]">{error}</p>}

          {showPw && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-black/10" /></div>
                <div className="relative flex justify-center"><span className="label bg-paper px-3 text-black/35">or</span></div>
              </div>

              <form onSubmit={handlePasswordSignIn} className="space-y-4">
                <div>
                  <label className="label mb-2 block text-black/40">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className="label mb-2 block text-black/40">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className={inputClass}
                    required
                    minLength={6}
                  />
                </div>

                {error && <p className="text-sm text-[#a31f34]">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="label w-full rounded-full border border-black/15 bg-white px-6 py-3.5 text-ink transition-colors hover:border-black/40 disabled:opacity-60"
                >
                  {loading ? 'Loading…' : 'Sign in'}
                </button>
              </form>
            </>
          )}

          <div className="mt-7 text-center text-sm text-black/55">
            Don&apos;t have an account?{' '}
            <Link href="/" className="font-medium text-ink underline-offset-2 hover:underline">
              Sign up
            </Link>
          </div>

          <div className="mt-9 text-center">
            <Link href="/" className="label text-black/35 transition-colors hover:text-ink">← Back home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
