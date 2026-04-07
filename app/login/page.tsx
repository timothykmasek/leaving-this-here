'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary for Vercel prerendering
  return (
    <Suspense fallback={<main className="min-h-screen bg-white" />}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup')
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
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-2xl font-light text-gray-900 mb-4">check your email</h1>
          <p className="text-sm text-gray-500 mb-2">
            we sent a confirmation link to <strong className="text-gray-900">{email}</strong>
          </p>
          <p className="text-sm text-gray-400">
            click the link in your inbox to finish setting up your account
          </p>
          <div className="mt-8 pt-8 border-t border-gray-100">
            <button
              onClick={() => { setSignedUp(false); setIsSignUp(false) }}
              className="text-sm text-gray-400 hover:text-gray-900"
            >
              ← back to sign in
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-light text-gray-900">
            {isSignUp ? 'create an account' : 'welcome back'}
          </h1>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-400 text-sm"
              required
              minLength={6}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'loading...' : isSignUp ? 'sign up' : 'sign in'}
          </button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-100"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-400">or</span>
          </div>
        </div>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full px-4 py-2 border border-gray-200 rounded-lg font-medium text-gray-700 hover:border-gray-400 transition-colors disabled:opacity-50 text-sm"
        >
          continue with google
        </button>

        <div className="mt-6 text-center text-sm">
          {isSignUp ? (
            <>
              already have an account?{' '}
              <button onClick={() => { setIsSignUp(false); setError(null) }} className="text-gray-900 font-medium hover:underline">
                sign in
              </button>
            </>
          ) : (
            <>
              don&apos;t have an account?{' '}
              <button onClick={() => { setIsSignUp(true); setError(null) }} className="text-gray-900 font-medium hover:underline">
                sign up
              </button>
            </>
          )}
        </div>

        <div className="mt-8 pt-8 border-t border-gray-100 text-center">
          <Link href="/" className="text-sm text-gray-400 hover:text-gray-900">← back home</Link>
        </div>
      </div>
    </main>
  )
}
