import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServer } from '@/lib/supabase/server'
import { SecondaryPage, SECONDARY_TITLE } from '@/components/SecondaryPage'
import { SettingsClient } from './SettingsClient'

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Your Bulletin account.',
}

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
    <SecondaryPage backHref={`/${profile.username}`}>
        <h1 className={`mb-10 ${SECONDARY_TITLE}`}>Settings</h1>
        <SettingsClient
          username={profile.username}
          email={user.email ?? null}
          providers={providers}
        />
    </SecondaryPage>
  )
}
