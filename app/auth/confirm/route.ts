import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// SSR-correct email/magic-link confirmation. Two callers:
//  - Admin-generated links (impersonate, claim, login-as) pass token_hash,
//    type and an explicit next.
//  - The Magic Link email template (Supabase dashboard) links here with
//    token_hash + type=email + redirect_to={{ .RedirectTo }}. Unlike the PKCE
//    ?code= lane through /auth/callback, a token_hash needs no code verifier
//    from the requesting browser, so the link works when it's opened on
//    another device or inside Gmail's in-app browser.
// verifyOtp exchanges the hash for a session and, because this server client
// writes cookies, the session lands where server-rendered pages read it.

export const dynamic = 'force-dynamic'

// Same-site relative paths only ("//evil.com" is protocol-relative).
const safePath = (p: string | null | undefined) =>
  p && p.startsWith('/') && !p.startsWith('//') ? p : null

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = (searchParams.get('type') || 'magiclink') as any

  // Explicit next wins; otherwise recover the next that /login tucked into
  // emailRedirectTo (/auth/callback?next=…), e.g. mid Claude-connector flow.
  let next = safePath(searchParams.get('next'))
  if (!next) {
    try {
      const redirectTo = new URL(searchParams.get('redirect_to') || '')
      if (redirectTo.origin === origin) next = safePath(redirectTo.searchParams.get('next'))
    } catch {
      // absent or not a URL: fall through to the profile lookup
    }
  }

  if (!tokenHash) {
    console.error(
      '[auth/confirm] no token_hash:',
      JSON.stringify(Object.fromEntries(searchParams.entries()))
    )
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

  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error) {
    console.error('[auth/confirm] verifyOtp failed:', error.message)
    return NextResponse.redirect(`${origin}/login?error=link_expired`)
  }

  if (next) return NextResponse.redirect(`${origin}${next}`)

  // Same landing as /auth/callback: your page if you have one, else /start
  // (account exists, no profile yet → the wizard resumes at the handle step).
  const userId = data.user?.id
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .maybeSingle()
    if (profile?.username) return NextResponse.redirect(`${origin}/${profile.username}`)
  }
  return NextResponse.redirect(`${origin}/start`)
}
