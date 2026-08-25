import { createSupabaseServer } from '@/lib/supabase/server'
import { getProfileByUsername } from '@/lib/queries'
import { timed } from '@/lib/timing'
import ProfileClient from './ProfileClient'

// Columns the profile grid + detail modal actually render. Deliberately excludes
// `raw_metadata` (a large JSON blob that's passed to PrimaryCard but never read)
// so we don't drag it over the wire for every bullet.
const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, image_pref, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

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

  // ONE round trip for the whole page.
  //
  // Every Supabase call costs ~139ms of pure network latency before the query
  // does any work — measured with a bare `select id`, which takes the same
  // 139ms as a real one. So this page's speed is decided by the NUMBER of hops,
  // not the weight of what's in them: 60 bullets cost 220ms, the lists cost
  // 139ms (i.e. free), and all three together as one embedded query cost 232ms.
  //
  // So the profile, its bullets and its lists come back together, keyed on the
  // USERNAME. Fetching the profile first to learn its id — which is what this
  // did — spends a whole round trip to obtain a value the same query could
  // have filtered on.
  //
  // getSession() rides alongside: it's a local JWT decode, not a network call
  // (the middleware already validated and refreshed the token), so it costs
  // nothing to await here. It only toggles owner-only UI; every write is still
  // guarded by RLS.
  const [{ data: { session } }, embedded] = await timed('profile:one-shot', () =>
    Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('profiles')
        .select(`*, bookmarks(${BULLET_COLS}), lists(id, name, slug, is_private, description, created_at, list_bookmarks(bookmark_id))`)
        .eq('username', username)
        .order('created_at', { referencedTable: 'bookmarks', ascending: false })
        .limit(INITIAL_BULLETS, { referencedTable: 'bookmarks' })
        .maybeSingle(),
    ])
  )
  const user = session?.user ?? null

  // The embed depends on the foreign keys being introspectable, and this is the
  // profile's only route to its own data — so if it fails for any reason, fall
  // back to the original three-query path rather than showing an empty page.
  let profile: any = embedded.error ? null : embedded.data
  let bookmarks: any[] | null = profile ? (profile.bookmarks || []) : null
  let lists: any[] = profile
    ? (profile.lists || []).map((l: any) => ({
        ...l,
        bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
      }))
    : []

  if (embedded.error) {
    profile = await timed('profile:fallback-profile', () => getProfileByUsername(username))
    if (profile) {
      const [b, l] = await timed('profile:fallback-bullets+lists', () =>
        Promise.all([
          supabase
            .from('bookmarks')
            .select(BULLET_COLS)
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false })
            .limit(INITIAL_BULLETS),
          fetchLists(supabase, profile.id),
        ])
      )
      bookmarks = b.data
      lists = l
    }
  }

  if (!profile) {
    return (
      <main className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 py-12 text-center">
          <p className="text-gray-500">user not found</p>
        </div>
      </main>
    )
  }

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
