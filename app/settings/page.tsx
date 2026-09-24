import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase/server'
import { BulletinHeader } from '@/components/BulletinHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { SettingsClient } from './SettingsClient'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your Bulletin account.',
}

// Footers must sit on the same measure as the page above them.
const PAGE_GRID = 'max-w-2xl px-6 sm:px-8'

// Account settings — the quiet page behind the footer link. The public face
// (name, bio, links) is edited on the profile page itself, under the pencil;
// this page is only what the profile page can't be: which login you use,
// moving links in and out, sign out, and the way out.
export default async function SettingsPage() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile?.username) redirect('/start')

  const providers = Array.from(
    new Set((user.identities ?? []).map((i) => i.provider).filter(Boolean)),
  )

  return (
    <main className="flex min-h-screen flex-col">
      <BulletinHeader action={null} logoClassName="h-[32px] sm:h-[44px]" />
      <div className={`mx-auto w-full ${PAGE_GRID} flex-1 pb-20 pt-8`}>
        <Link
          href={`/${profile.username}`}
          className="label mb-6 inline-block text-black/35 transition-colors hover:text-ink"
        >
          ← back
        </Link>
        <h1 className="mb-10 font-sans text-3xl font-bold tracking-tight text-ink">Settings</h1>
        <SettingsClient
          username={profile.username}
          email={user.email ?? null}
          providers={providers}
        />
      </div>
      <SiteFooter widthClassName={PAGE_GRID} />
    </main>
  )
}
