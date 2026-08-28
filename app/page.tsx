import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BetaLanding } from '@/components/home/BetaLanding'

// The private-beta landing (design handoff "Bulletin Landing", 2026-08-28):
// wordmark, tagline, and an inline email capture over an animated dot grid.
// One viewport, nothing below the fold. Sign-up itself stays open everywhere
// else in the app — the waitlist is the front door's posture, not a gate.
//
// The v3 marketing home this replaced is kept intact but unrouted, on purpose
// (Tim, 2026-08-28): components/home/{HeroField,HowItWorks,Featured,MobileHome}
// still compile and can be re-routed here to bring it back.

export default async function Home({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  // OAuth can land here with `?code=` instead of on /auth/callback when Supabase
  // falls back to its Site URL (e.g. the apex 308-redirects to www/). Forward it
  // to the callback so the code is exchanged and the user lands on their profile
  // rather than getting stranded, logged-in, on the landing page.
  if (searchParams?.code) {
    redirect(`/auth/callback?code=${encodeURIComponent(searchParams.code)}`)
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single()

    if (profile) {
      redirect(`/${profile.username}`)
    } else {
      // Signed in but no page yet → onboarding resumes at the username step.
      redirect('/start')
    }
  }

  return <BetaLanding />
}
