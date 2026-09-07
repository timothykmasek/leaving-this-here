import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// SSR-correct email/magic-link confirmation. Admin-generated links
// (impersonate, claim, login-as) hand us a `token_hash`; verifyOtp exchanges
// it for a session and — because this server client writes cookies — the
// session lands in cookies where the server-rendered pages read it. The old
// path redirected to GoTrue's implicit /verify link, which only ever set a
// client-side (hash-fragment) session, so SSR still saw a logged-out visitor
// and never showed owner controls.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = (searchParams.get('type') || 'magiclink') as any
  const next = searchParams.get('next') || '/'

  if (!tokenHash) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.delete(name)
        },
      },
    }
  )

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // Relative-only next, so this can't be turned into an open redirect.
  const dest = next.startsWith('/') ? next : '/'
  return NextResponse.redirect(`${origin}${dest}`)
}
