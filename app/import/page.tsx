import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createSupabaseServer } from '@/lib/supabase/server'
import ImportClient from './ImportClient'

export const metadata: Metadata = {
  title: 'import · Bulletin',
  description: 'Bulk-add links to your Bulletin from a CSV or a pasted list.',
}

// Bulk import — the quiet migration door linked from the footer. Signed-in
// only: the page saves straight into the visitor's own collection.
export default async function ImportPage() {
  const supabase = await createSupabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()
  // Signed in but no profile yet → finish onboarding first.
  if (!profile?.username) redirect('/start')

  return <ImportClient username={profile.username} />
}
