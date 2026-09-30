import { cache } from 'react'
import { createSupabaseServer } from '@/lib/supabase/server'

// Per-request memoized data fetchers. React's cache() dedupes calls within a
// single request render pass — which is exactly when a route's generateMetadata
// (in layout.tsx) and its page component both run. Routing both through these
// means the profile/list lookups fire ONCE per navigation instead of twice.

export const getProfileByUsername = cache(async (username: string) => {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()
  return data
})

// Everything a list page renders, in ONE round trip: the list, its owner's
// profile and every member bullet (see app/[username]/[listSlug]/page.tsx for
// why the hop count is what matters). Shared by the page and its
// generateMetadata, so the share card no longer costs two sequential lookups
// of its own before the page's query even starts.
export const LIST_BULLET_COLS =
  'id, title, description, url, image_url, screenshot_url, favicon_url, note, card_type, image_pref, is_private, outbound_url, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

export const getListPage = cache(async (username: string, slug: string) => {
  const supabase = await createSupabaseServer()
  return supabase
    .from('lists')
    .select(
      `id, name, slug, cover_image_url, is_private,
       profiles!inner(id, username, display_name, bio, links, is_preview),
       list_bookmarks(bookmark_id, bookmarks(${LIST_BULLET_COLS}))`
    )
    .eq('profiles.username', username)
    .eq('slug', slug)
    .maybeSingle()
})
