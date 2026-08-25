import type { MetadataRoute } from 'next'
import { createClient } from '@supabase/supabase-js'
import { SITE_URL } from '@/lib/meta'

// Every public profile and every public list, so the things this product exists
// to publish can actually be found. Previously nothing was listed at all — and
// /sitemap.xml itself fell through to /[username] and answered 200 with a
// profile shell.
//
// A plain anon client rather than the cookie-bound server one: this is nobody's
// request, and it must see exactly what a logged-out visitor sees. RLS then
// guarantees the result — a private list is not withheld by the filter below so
// much as never returned in the first place. The is_private filter is belt to
// that braces, and would matter if the policy ever loosened.

export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const roots: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.1 },
  ]

  // No credentials at build time (a fresh clone, or CI) → still emit a valid
  // sitemap of the static pages rather than failing the build.
  if (!url || !key) return roots

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })

    const [{ data: profiles }, { data: lists }] = await Promise.all([
      sb.from('profiles').select('username'),
      sb
        .from('lists')
        .select('slug, is_private, profiles(username)')
        .eq('is_private', false),
    ])

    return [
      ...roots,
      ...(profiles || [])
        .filter((p) => p.username)
        .map((p) => ({
          url: `${SITE_URL}/${p.username}`,
          changeFrequency: 'daily' as const,
          priority: 0.8,
        })),
      ...(lists || [])
        .map((l: any) => {
          const username = l.profiles?.username
          return username && l.slug
            ? {
                url: `${SITE_URL}/${username}/${l.slug}`,
                changeFrequency: 'weekly' as const,
                priority: 0.6,
              }
            : null
        })
        .filter(Boolean) as MetadataRoute.Sitemap,
    ]
  } catch {
    // A sitemap that 500s is worse than a short one.
    return roots
  }
}
