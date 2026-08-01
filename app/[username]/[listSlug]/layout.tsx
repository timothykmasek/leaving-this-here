import type { Metadata } from 'next'
import { getProfileByUsername, getListBySlug } from '@/lib/queries'

// Dynamic share metadata for a published list at /username/<slug>. Mirrors the
// profile layout so a shared list URL gets its own title + description. The
// profile + list lookups go through cache()d fetchers so the page component
// (which needs the same rows) reuses them instead of re-querying.

export async function generateMetadata({
  params,
}: {
  params: { username: string; listSlug: string }
}): Promise<Metadata> {
  const profile = await getProfileByUsername(params.username)

  let listName: string | null = null
  if (profile) {
    const { data: list } = await getListBySlug(profile.id, params.listSlug)
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
