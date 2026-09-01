import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DepthHero } from '@/components/home/DepthHero'

// The depth hero (shipped 2026-09-01): the private-beta landing's lockup and
// email capture, with 24 real saved links drifting through 3D depth behind
// it. One viewport, nothing below the fold; scroll kicks the cards instead of
// the page. Sign-up itself stays open everywhere else in the app — the
// waitlist is the front door's posture, not a gate.
//
// Predecessors kept intact but unrouted, on purpose (Tim): BetaLanding (the
// static-lockup landing this replaced) and the v3 marketing home
// (components/home/{HeroField,HowItWorks,Featured,MobileHome}) both still
// compile and can be re-routed here to bring either back.

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

  return <DepthHero />
}
