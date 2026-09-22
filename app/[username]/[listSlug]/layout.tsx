import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProfileByUsername, getListBySlug } from '@/lib/queries'
import { SITE_NAME } from '@/lib/meta'

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

  // Same reason as the profile layout: the status line is committed before the
  // page body runs, so an unknown owner or list has to be refused here.
  if (!profile) notFound()

  const { data: list } = await getListBySlug(profile.id, params.listSlug)
  if (!list) notFound()

  const listName: string | null = list.name || null

  const owner = profile?.display_name || profile?.username || params.username
  const name = listName || params.listSlug
  // Lists carry no description (the column went with migration 030), so the
  // share card says what it can: the name, the curator, the site.
  const description = `${name} — a list by ${owner} on ${SITE_NAME}.`
  const url = `/${params.username}/${params.listSlug}`

  return {
    // Absolute, not templated. This segment sits under [username], which sets
    // its own string title, and the root's "%s · Bulletin" template stopped
    // applying here — a list page came out "The fit check · Tim Masek" with no
    // masthead at all. Spelling it out cannot silently lose or double it.
    title: { absolute: `${name} · ${owner} · ${SITE_NAME}` },
    description,
    // A preview profile's lists inherit its noindex — same reasoning as the
    // profile layout.
    ...(profile?.is_preview ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical: url },
    openGraph: {
      title: name,
      description,
      type: 'website',
      url,
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
