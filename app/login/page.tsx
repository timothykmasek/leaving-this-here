'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { BulletinHeader } from '@/components/BulletinHeader'
import { INVITE_ONLY, APPLE_WEB_SIGNIN } from '@/lib/beta'

// Sign-in only: Google (and Apple, once APPLE_WEB_SIGNIN is on), or an
// emailed sign-in link. Passwords don't exist on Bulletin (the demo personas
// that used to need the hidden ?pw=1 form now carry plus-addressed real emails
// and ride the same magic-link lane; see scripts/set-user-email.ts). "Sign up"
// points at the /start wizard, or at the landing page's request-access
// capture while INVITE_ONLY.

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" />}>
      <LoginPageInner />
    </Suspense>
  )
}

const SIGNUP_HREF = INVITE_ONLY ? '/' : '/start'

const inputClass =
  'w-full rounded-full border border-black/15 bg-white px-5 py-3 text-sm text-ink placeholder:text-black/40 focus:border-black/40 focus:outline-none'

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [linkSent, setLinkSent] = useState(false)
  const [error, setError] = useState<string | null>(
    // Set by /auth/callback when the OAuth round-trip fails. invite_only is
    // Supabase refusing to mint an account (signups off, email not on the
    // guest list); auth_failed is everything else.
    searchParams?.get('error') === 'invite_only'
      ? 'That Google account isn’t on the guest list yet. Bulletin is invite-only right now.'
      : searchParams?.get('error') === 'auth_failed'
        ? 'Sign-in didn’t go through. Mind trying again?'
        : null
  )

  const supabase = createClient()

  // Old /login?mode=signup links go wherever signing up lives.
  useEffect(() => {
    if (searchParams?.get('mode') === 'signup') router.replace(SIGNUP_HREF)
  }, [searchParams, router])

  // Where to land after auth (e.g. back on /oauth/consent mid-connector-flow).
  // Rides through /auth/callback, which only honors same-site paths.
  const next = searchParams?.get('next')
  const callbackUrl = () =>
    `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    })
    if (error) setError(error.message)
  }

  // The artifact's second lane: "or a link emailed to them". shouldCreateUser
  // false keeps the gate honest — an email without an account gets the
  // guest-list message, never a fresh auth user. Delivery runs through the
  // Resend SMTP hookup (domain-verified), not Supabase's throttled mailer.
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: callbackUrl(),
        },
      })
      if (error) {
        setError(
          /signup|not allowed|not found/i.test(error.message)
            ? INVITE_ONLY
              ? 'That email isn’t on the guest list yet. Bulletin is invite-only right now.'
              : 'There’s no Bulletin for that email yet. Sign up below.'
            : error.message
        )
      } else {
        setLinkSent(true)
      }
    } catch (err: any) {
      setError(err.message || 'something went wrong')
    } finally {
      setLoading(false)
    }
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
            onClick={() => handleOAuth('google')}
            disabled={loading}
            className="label w-full rounded-full bg-ink px-6 py-3.5 text-paper transition-colors hover:bg-black disabled:opacity-60"
          >
            Continue with Google
          </button>
          {APPLE_WEB_SIGNIN && (
            <button
              onClick={() => handleOAuth('apple')}
              disabled={loading}
              className="label mt-2.5 w-full rounded-full bg-ink px-6 py-3.5 text-paper transition-colors hover:bg-black disabled:opacity-60"
            >
              Continue with Apple
            </button>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-black/10" /></div>
            <div className="relative flex justify-center"><span className="label bg-paper px-3 text-black/35">or</span></div>
          </div>

          {linkSent ? (
            <p className="text-center text-sm leading-relaxed text-black/55">
              Check your inbox. We emailed <strong className="text-ink">{email}</strong> a
              sign-in link.
            </p>
          ) : (
            <form onSubmit={handleMagicLink} className="flex gap-2.5">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
                required
              />
              <button
                type="submit"
                disabled={loading}
                className="label shrink-0 whitespace-nowrap rounded-full border border-black/15 bg-white px-5 py-3 text-ink transition-colors hover:border-black/40 disabled:opacity-60"
              >
                Email me a link
              </button>
            </form>
          )}

          {error && <p className="mt-4 text-center text-sm text-[#a31f34]">{error}</p>}

          <div className="mt-7 text-center text-sm text-black/55">
            Don&apos;t have an account?{' '}
            <Link href={SIGNUP_HREF} className="font-medium text-ink underline-offset-2 hover:underline">
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
