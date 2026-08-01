import type { Metadata } from 'next'
import { getProfileByUsername } from '@/lib/queries'

// Dynamic metadata for each folio. The accompanying opengraph-image.tsx
// handles the share-card image; this file sets title, description, and
// canonical url so /username pages feel like their own publications. The
// profile lookup is cache()d so the page component reuses it (no duplicate
// query per navigation).

export async function generateMetadata({
  params,
}: {
  params: { username: string }
}): Promise<Metadata> {
  const profile = await getProfileByUsername(params.username)

  const name = profile?.display_name || profile?.username || params.username
  const description = profile?.bio || `${name}'s collection on Bulletin — a public reading list of links worth keeping.`

  return {
    title: `${name} · Bulletin`,
    description,
    openGraph: {
      title: `${name}'s bullets`,
      description,
      type: 'profile',
      url: `/${params.username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name}'s bullets`,
      description,
    },
  }
}

export default function UsernameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
