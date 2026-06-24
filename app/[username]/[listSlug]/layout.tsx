import type { Metadata } from 'next'
import { createSupabaseServer } from '@/lib/supabase/server'

// Dynamic share metadata for a published list at /username/<slug>. Mirrors the
// profile layout so a shared list URL gets its own title + description.

export async function generateMetadata({
  params,
}: {
  params: { username: string; listSlug: string }
}): Promise<Metadata> {
  const supabase = await createSupabaseServer()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', params.username)
    .single()

  let listName: string | null = null
  if (profile) {
    const { data: list } = await supabase
      .from('lists')
      .select('name')
      .eq('user_id', profile.id)
      .eq('slug', params.listSlug)
      .single()
    listName = list?.name || null
  }

  const owner = profile?.display_name || profile?.username || params.username
  const name = listName || params.listSlug
  const description = `${name} — a list by ${owner} on Bulletin.`

  return {
    title: `${name} · ${owner} · Bulletin`,
    description,
    openGraph: {
      title: name,
      description,
      type: 'website',
      url: `/${params.username}/${params.listSlug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
    },
  }
}

export default function ListLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
