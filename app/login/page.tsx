'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <LoginPageInner />
    </Suspense>
  )
}

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
          // Friendly error messages
          if (error.message.includes('rate') || error.message.includes('security')) {
            setError('please wait a moment before trying again')
          } else {
            setError(error.message)
          }
        } else {
          setSignedUp(true)
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
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
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) setError(error.message)
  }

  // Show confirmation screen after sign up
  if (signedUp) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <h1 className="font-serif text-2xl text-ink mb-3">check your email</h1>
          <p className="text-sm text-stone-600 mb-4">
            we sent a confirmation link to <strong className="text-ink">{email}</strong>
          </p>
          <p className="text-sm text-stone-500">
            click the link in your inbox to finish setting up your account
          </p>
          <div className="mt-8 pt-8 border-t border-stone-300/50">
            <button
              onClick={() => { setSignedUp(false); setIsSignUp(false) }}
              className="text-sm text-stone-400 hover:text-ink"
            >
              ← back to sign in
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-serif text-2xl text-ink">
            {isSignUp ? 'create an account' : 'welcome back'}
          </h1>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-stone-400">email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border border-stone-300 bg-white/80 px-4 py-2.5 text-sm focus:outline-none focus:border-ink/60"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-stone-400">password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-stone-300 bg-white/80 px-4 py-2.5 text-sm focus:outline-none focus:border-ink/60"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-sm text-red-700">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-ink/85 disabled:opacity-60 transition-colors"
          >
            {loading ? 'loading…' : isSignUp ? 'sign up' : 'sign in'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-stone-300/70" /></div>
          <div className="relative flex justify-center"><span className="bg-paper px-3 text-xs text-stone-400">or</span></div>
        </div>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full rounded-full border border-stone-300 bg-white/60 px-6 py-3 text-sm font-medium text-ink hover:border-stone-500 transition-colors"
        >
          continue with google
        </button>

        <div className="mt-6 text-center text-sm">
          {isSignUp ? (
            <>
              already have an account?{' '}
              <button onClick={() => { setIsSignUp(false); setError(null) }} className="text-ink font-medium hover:underline underline-offset-2">
                sign in
              </button>
            </>
          ) : (
            <>
              don&apos;t have an account?{' '}
              <button onClick={() => { setIsSignUp(true); setError(null) }} className="text-ink font-medium hover:underline underline-offset-2">
                sign up
              </button>
            </>
          )}
        </div>

        <div className="mt-8 pt-8 border-t border-stone-300/50 text-center">
          <Link href="/" className="text-sm text-stone-400 hover:text-ink">← back home</Link>
        </div>
      </div>
    </main>
  )
}
