import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // With "Allow new users to sign up" off, an uninvited Google sign-in comes
  // back with no code and an error_description like "Signups not allowed for
  // this instance". Surface that as the invite-only message, not a generic
  // failure.
  const errorDescription = searchParams.get('error_description') ?? ''
  if (!code && /signup|not allowed/i.test(errorDescription)) {
    return NextResponse.redirect(`${origin}/login?error=invite_only`)
  }

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Check if user already has a profile
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single()

        if (profile) {
          return NextResponse.redirect(`${origin}/${profile.username}`)
        }
      }
      // No profile yet → onboarding. The account now exists (account is step 1
      // of the account-first flow), so /start detects "authed + no profile" and
      // resumes at the username step.
      return NextResponse.redirect(`${origin}/start`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
