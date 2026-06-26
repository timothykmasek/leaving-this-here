'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { BulletinHeader } from '@/components/BulletinHeader'

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-paper" />}>
      <LoginPageInner />
    </Suspense>
  )
}

const inputClass =
  'w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm text-ink placeholder:text-black/40 focus:border-black/40 focus:outline-none'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(searchParams?.get('mode') === 'signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedUp, setSignedUp] = useState(false)

  const supabase = createClient()

  // Signup now lives in the account-first onboarding wizard. Funnel any old
  // /login?mode=signup links there so there's a single signup path.
  useEffect(() => {
    if (searchParams?.get('mode') === 'signup') router.replace('/start')
  }, [searchParams, router])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        })
        if (error) {
          if (error.message.includes('rate') || error.message.includes('security')) {
            setError('please wait a moment before trying again')
          } else {
            setError(error.message)
          }
        } else {
          setSignedUp(true)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.message.includes('Invalid login')) {
            setError('email or password is incorrect')
          } else {
            setError(error.message)
          }
        } else {
          router.push('/')
          router.refresh()
        }
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

  // Confirmation screen after sign up
  if (signedUp) {
    return (
      <main className="flex min-h-screen flex-col bg-paper">
        <BulletinHeader action={null} logoClassName="h-[26px] sm:h-[34px]" />
        <div className="flex flex-1 items-center justify-center px-4 pb-20">
          <div className="w-full max-w-md text-center">
            <h1 className="font-serif text-[24px] font-bold text-ink">Check your email</h1>
            <p className="mt-4 text-sm leading-relaxed text-black/55">
              We sent a confirmation link to <strong className="text-ink">{email}</strong>.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-black/45">
              Click the link in your inbox to finish setting up your account.
            </p>
            <button
              onClick={() => { setSignedUp(false); setIsSignUp(false) }}
              className="label mt-10 text-black/40 transition-colors hover:text-ink"
            >
              ← Back to sign in
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <BulletinHeader action={null} logoClassName="h-[26px] sm:h-[34px]" />
      <div className="flex flex-1 items-center justify-center px-4 pb-20 pt-6">
        <div className="w-full max-w-md">
          <h1 className="mb-8 text-center font-serif text-[24px] font-bold text-ink">
            {isSignUp ? 'Create an account' : 'Welcome back'}
          </h1>

          <form onSubmit={handleEmailAuth} className="mb-6 space-y-4">
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
              className="label w-full rounded-full bg-ink px-6 py-3.5 text-paper transition-colors hover:bg-black disabled:opacity-60"
            >
              {loading ? 'Loading…' : isSignUp ? 'Sign up' : 'Sign in'}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-black/10" /></div>
            <div className="relative flex justify-center"><span className="label bg-paper px-3 text-black/35">or</span></div>
          </div>

          <button
            onClick={handleGoogleAuth}
            disabled={loading}
            className="label w-full rounded-full border border-black/15 bg-white px-6 py-3.5 text-ink transition-colors hover:border-black/40"
          >
            Continue with Google
          </button>

          <div className="mt-7 text-center text-sm text-black/55">
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <button onClick={() => { setIsSignUp(false); setError(null) }} className="font-medium text-ink underline-offset-2 hover:underline">
                  Sign in
                </button>
              </>
            ) : (
              <>
                Don&apos;t have an account?{' '}
                <Link href="/start" className="font-medium text-ink underline-offset-2 hover:underline">
                  Sign up
                </Link>
              </>
            )}
          </div>

          <div className="mt-9 text-center">
            <Link href="/" className="label text-black/35 transition-colors hover:text-ink">← Back home</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
