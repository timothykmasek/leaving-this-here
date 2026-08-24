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

// added_at rides along so the page can show "updated <date>" — a list's
// freshness is when something was last ADDED to it, which list_bookmarks
// already records; there's no updated_at on lists and none is needed.
const LIST_COLS = 'id, name, slug, is_private, description, list_bookmarks(bookmark_id, added_at)'

/** PostgREST's undefined_column. Selecting a column that doesn't exist is a hard
 *  400, unlike a missing TABLE, which this app already tolerates. */
function isMissingColumn(error: any, column: string): boolean {
  return error?.code === '42703' || String(error?.message || '').includes(column)
}

export const getListBySlug = cache(async (profileId: string, slug: string) => {
  const supabase = await createSupabaseServer()
  const query = (cols: string) =>
    supabase.from('lists').select(cols).eq('user_id', profileId).eq('slug', slug).single()

  // Migrations here are run by hand in the Supabase SQL editor, and this repo
  // deliberately keeps deploys independent of that (see migration 008's header).
  // So a list page must still render on a database where 019 hasn't been applied
  // — it just has no cover. One wasted round-trip until the column lands, then
  // never again.
  let { data, error } = await query(`${LIST_COLS}, cover_image_url`)
  if (error && isMissingColumn(error, 'cover_image_url')) {
    ({ data, error } = await query(LIST_COLS))
  }
  // Selecting via a runtime string forfeits supabase-js's column inference, so
  // the row comes back untyped. Callers already read it through `as any`.
  return { data: data as any, error }
})
