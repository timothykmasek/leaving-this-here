import { createSupabaseServer } from '@/lib/supabase/server'
import ProfileClient from './ProfileClient'

// Columns the profile grid + detail modal actually render. Deliberately excludes
// `raw_metadata` (a large JSON blob that's passed to BookmarkCard but never read)
// so we don't drag it over the wire for every bullet.
const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, created_at'

// How many of the newest bullets to server-render for instant first paint. A
// seeded/power profile can have hundreds — SSR-ing all of them bloats the HTML
// and slows the render. The client island background-loads the full set on mount
// (see ProfileClient) so search + list-membership stay correct across everything.
const INITIAL_BULLETS = 60

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>

// Lists with their member bookmark ids. Best effort: RLS hides others' private
// lists, and if migration 009 (slug column) isn't applied yet we retry without it
// so lists still render, just without their public-URL slug.
async function fetchLists(supabase: SupabaseServer, uid: string) {
  const shape = (data: any[] | null) =>
    (data || []).map((l: any) => ({
      ...l,
      bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
    }))
  try {
    const { data, error } = await supabase
      .from('lists')
      .select('id, name, slug, is_private, description, created_at, list_bookmarks(bookmark_id)')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
    if (!error) return shape(data)
    if (/slug/i.test(error.message || '')) {
      const fallback = await supabase
        .from('lists')
        .select('id, name, is_private, description, created_at, list_bookmarks(bookmark_id)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (!fallback.error) return shape(fallback.data)
    }
    return []
  } catch {
    return []
  }
}

export default async function ProfilePage({
  params,
}: {
  params: { username: string }
}) {
  const supabase = await createSupabaseServer()
  const username = params.username

  // Auth and the profile lookup are independent — fire them together.
  const [
    { data: { user } },
    { data: profile },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('*').eq('username', username).single(),
  ])

  if (!profile) {
    return (
      <main className="min-h-screen bg-paper">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <p className="text-gray-500">user not found</p>
        </div>
      </main>
    )
  }

  // Bookmarks and lists both key off the profile id but not off each other —
  // fetch them in parallel rather than serially.
  const [{ data: bookmarks }, lists] = await Promise.all([
    supabase
      .from('bookmarks')
      .select(BULLET_COLS)
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(INITIAL_BULLETS),
    fetchLists(supabase, profile.id),
  ])

  // If we got a full page, there are probably more — tell the client to
  // background-load the rest so search/lists cover the whole collection.
  const mightHaveMore = (bookmarks?.length ?? 0) === INITIAL_BULLETS

  return (
    <ProfileClient
      username={username}
      initialProfile={profile}
      initialBookmarks={bookmarks || []}
      initialLists={lists}
      currentUserId={user?.id ?? null}
      mightHaveMore={mightHaveMore}
    />
  )
}
