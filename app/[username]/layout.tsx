import type { Metadata } from 'next'
import { createSupabaseServer } from '@/lib/supabase/server'

// Dynamic metadata for each folio. The accompanying opengraph-image.tsx
// handles the share-card image; this file sets title, description, and
// canonical url so /username pages feel like their own publications.

export async function generateMetadata({
  params,
}: {
  params: { username: string }
}): Promise<Metadata> {
  const supabase = await createSupabaseServer()
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name, bio')
    .eq('username', params.username)
    .single()

  const name = profile?.display_name || profile?.username || params.username
  const description = profile?.bio || `${name}'s folio on leaving this here — a public reading list you can subscribe to.`

  return {
    title: `${name} · leaving this here`,
    description,
    openGraph: {
      title: `${name}'s folio`,
      description,
      type: 'profile',
      url: `/${params.username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name}'s folio`,
      description,
    },
  }
}

export default function UsernameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
