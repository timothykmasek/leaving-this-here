import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { INVITE_ONLY } from '@/lib/beta'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // With "Allow new users to sign up" off, an uninvited Google sign-in comes
  // back with no code and an error_description like "Signups not allowed for
  // this instance". Surface that as the invite-only message, not a generic
  // failure.
  const errorDescription = searchParams.get('error_description') ?? ''
  if (!code) {
    // The raw provider error is the only diagnostic for a failed round-trip —
    // keep it in the function logs (vercel logs), the user gets the soft copy.
    console.error(
      '[auth/callback] code-less redirect:',
      JSON.stringify(Object.fromEntries(searchParams.entries()))
    )
    if (/signup|not allowed/i.test(errorDescription)) {
      return NextResponse.redirect(`${origin}/login?error=invite_only`)
    }
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

        // No profile = not on the guest list (profiles are only minted by
        // scripts/invite.ts during the beta). Their sign-in still counts as
        // knocking: file the email as a request (rings the doorbell, and the
        // unique index absorbs repeats), then end the session so they aren't
        // left half-authed in a product they can't enter.
        if (INVITE_ONLY) {
          if (user.email) {
            try {
              await fetch(`${origin}/api/waitlist`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email }),
              })
            } catch {
              // the gate must close even if the doorbell doesn't ring
            }
          }
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=invite_only`)
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
