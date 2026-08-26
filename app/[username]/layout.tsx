import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getProfileByUsername } from '@/lib/queries'
import { SITE_NAME, SITE_DESCRIPTION, clampDescription } from '@/lib/meta'

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

  // Decided HERE, not in the page. The page has a loading.tsx, so its response
  // starts streaming with 200 in the status line before the page body can call
  // notFound() — the visitor saw the 404 page, but crawlers were told 200, and
  // the head still carried a title invented from the path
  // ("robots-nonsense-xyz · Bulletin"). generateMetadata runs before the head
  // is sent, so refusing here sets a real 404. The lookup is cache()d, so the
  // page reuses this exact query rather than repeating it.
  if (!profile) notFound()

  const name = profile?.display_name || profile?.username || params.username
  // Their own words when they have written any — a bio says what this person
  // collects far better than a template can. Clamped because a long bio is cut
  // by the search engine and the share card anyway, and better to cut it on a
  // word ourselves. Falls back to the site line rather than inventing a
  // sentence about "reading lists", which is the old bookmark-app framing.
  const description = clampDescription(profile?.bio) || SITE_DESCRIPTION
  const shareTitle = `${name} on ${SITE_NAME}`

  return {
    // The masthead is appended by the root template.
    title: name,
    description,
    // Preview profiles (seeded for outreach, unclaimed) stay out of search:
    // reachable by the direct link the DM carries, but never indexed under a
    // real person's name before they've said yes. Absent column (migration 023
    // not applied) is falsy, so this is safe to ship ahead of the migration.
    ...(profile?.is_preview ? { robots: { index: false, follow: false } } : {}),
    alternates: { canonical: `/${params.username}` },
    openGraph: {
      title: shareTitle,
      description,
      type: 'profile',
      url: `/${params.username}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: shareTitle,
      description,
    },
  }
}

export default function UsernameLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
