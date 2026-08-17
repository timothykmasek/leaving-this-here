import { createSupabaseServer } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { HeroField } from '@/components/home/HeroField'
import { HowItWorks } from '@/components/home/HowItWorks'
import { Featured } from '@/components/home/Featured'
import { MobileHome } from '@/components/home/MobileHome'
import { SiteFooter } from '@/components/SiteFooter'

// The public marketing homepage (design handoff "Bulletin home v3"). Four bands:
// the drifting hero field, a section title, how-it-works, and the featured
// tables over the footer. It fetches nothing — every link, caption and count is
// fixed in lib/homeContent.
//
// Two screens, not one responsive layout: the desktop hero is a fixed 1330px
// canvas of absolutely-placed cards, and the mobile design deliberately drops
// the physics and the staged module (see MobileHome). They swap at `lg`.

export default async function Home({
  searchParams,
}: {
  searchParams: { code?: string }
}) {
  // OAuth can land here with `?code=` instead of on /auth/callback when Supabase
  // falls back to its Site URL (e.g. the apex 308-redirects to www/). Forward it
  // to the callback so the code is exchanged and the user lands on their profile
  // rather than getting stranded, logged-in, on the marketing home page.
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

  return (
    <div className="min-h-screen overflow-x-hidden">
      {/* ── Desktop ── */}
      <div className="hidden lg:block">
        <HeroField />

        <section className="mx-auto flex w-[1184px] max-w-full justify-center px-6 pb-11 xl:px-0">
          <h2 className="mb-[70px] text-center text-[40px] leading-[46px] text-black">
            Connect the dots, one bullet at a time.
          </h2>
        </section>

        <HowItWorks />
        <Featured />
        <div className="h-[72px]" />
      </div>

      {/* ── Mobile ── */}
      <div className="lg:hidden">
        <MobileHome />
        <div className="h-10" />
      </div>

      <SiteFooter />
    </div>
  )
}
