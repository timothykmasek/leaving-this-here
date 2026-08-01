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

export const getListBySlug = cache(async (profileId: string, slug: string) => {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase
    .from('lists')
    .select('id, name, slug, is_private, description, list_bookmarks(bookmark_id)')
    .eq('user_id', profileId)
    .eq('slug', slug)
    .single()
  return { data, error }
})
