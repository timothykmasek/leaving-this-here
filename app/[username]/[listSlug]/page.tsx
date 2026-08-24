import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getProfileByUsername, getListBySlug } from '@/lib/queries'
import { timed } from '@/lib/timing'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { ListHero, ListTagline } from '@/components/ListHero'
import { PublicHeader } from '@/components/PublicHeader'
import { ListDetailClient } from './ListDetailClient'
import { SiteFooter } from '@/components/SiteFooter'

// Public, shareable page for a single list at /username/<slug>. Read-only —
// owners manage membership and rename from their profile. RLS hides private
// lists from everyone but the owner, so a private slug 404s for visitors.
//
// Server-rendered: the card grid ships in the initial HTML (good for shared-link
// previews + first paint) instead of a client-side loading→fetch waterfall.

// Only the columns the cards render (raw_metadata is passed but never read).
// Same fluid grid as the profile: page margin equals the column gutter.
const LIST_GRID = 'max-w-[1720px] px-4 sm:px-10'

const BULLET_COLS =
  'id, title, description, url, image_url, screenshot_url, favicon_url, note, card_type, image_pref, created_at, keywords, place:raw_metadata->place'

function notFound(username: string) {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-12 text-center">
        <p className="text-gray-500">list not found</p>
        <Link href={`/${username}`} className="mt-3 inline-block text-sm text-stone-400 hover:text-ink">
          ← back to profile
        </Link>
      </div>
    </main>
  )
}

export default async function ListPage({
  params,
}: {
  params: { username: string; listSlug: string }
}) {
  const { username, listSlug } = params
  const supabase = await createSupabaseServer()

  // Stage 1 — auth + profile are independent; the profile lookup is shared with
  // this route's generateMetadata via a per-request cache() so it fires once.
  // Identity via getSession() (local decode) not getUser() (network) — middleware
  // already validated the token; here it only toggles the owner management view.
  const [{ data: { session } }, profile] = await timed('list:auth+profile', () =>
    Promise.all([supabase.auth.getSession(), getProfileByUsername(username)])
  )
  const user = session?.user ?? null
  if (!profile) return notFound(username)

  const isOwner = !!user && user.id === profile.id

  // Stage 2 — the requested list (also shared with generateMetadata) and, for the
  // owner, their full list set for the management sidebar. Independent → parallel.
  const [listRes, allListsRes] = await timed('list:list+allLists', () =>
    Promise.all([
      getListBySlug(profile.id, listSlug),
      isOwner
        ? supabase
            .from('lists')
            .select('id, name, slug, is_private, description, list_bookmarks(bookmark_id)')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: null }),
    ])
  )
  const { data: list, error } = listRes
  if (error || !list) return notFound(username)

  // Stage 3 — the member bullets (needs the list's ids, so it follows stage 2).
  const ids = ((list as any).list_bookmarks || []).map((x: any) => x.bookmark_id)
  let bullets: any[] = []
  if (ids.length) {
    const { data: bmarks } = await timed('list:bullets', () =>
      supabase
        .from('bookmarks')
        .select(BULLET_COLS)
        .in('id', ids)
        .order('created_at', { ascending: false })
    )
    bullets = bmarks || []
  }

  const owner = profile.display_name || profile.username

  // Owner view: hand off to a client island that carries the profile's list
  // controls (rename / delete / description + per-bullet management) onto the
  // list's own URL. Visitors keep the read-only server render below.
  if (isOwner) {
    // allLists was fetched in parallel back in stage 2.
    const shapedLists = (((allListsRes as any).data as any[]) || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      slug: l.slug ?? null,
      is_private: l.is_private,
      description: l.description ?? null,
      bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
    }))

    return (
      <main className="min-h-screen">
        <PublicHeader
          loggedIn
          logoClassName="h-[32px] sm:h-[44px]"
          widthClassName={LIST_GRID}
          stickyLogo
          tagline={<ListTagline username={profile.username} ownerName={owner} isOwner />}
        />
        <div className={`mx-auto ${LIST_GRID} pb-16 pt-4 sm:pt-8`}>
          <ListDetailClient
            username={profile.username}
            profileId={profile.id}
            bio={profile.bio}
            ownerName={owner}
            initialList={{
              id: (list as any).id,
              name: (list as any).name,
              slug: (list as any).slug ?? null,
              is_private: (list as any).is_private,
              description: (list as any).description ?? null,
              bookmark_ids: ids,
            }}
            initialBullets={bullets}
            initialLists={shapedLists}
          />
        </div>
        <SiteFooter />
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      <PublicHeader
        loggedIn={!!user}
        logoClassName="h-[32px] sm:h-[44px]"
        widthClassName={LIST_GRID}
        stickyLogo
        tagline={<ListTagline username={username} ownerName={owner} isOwner={false} />}
      />
      <div className={`mx-auto ${LIST_GRID} pb-16 pt-4 sm:pt-8`}>
        <ListHero
          count={bullets.length}
          name={list.name}
          description={list.description}
          isPrivate={!!list.is_private}
        />

        {bullets.length > 0 ? (
          <Masonry>
            {bullets.map((b) => (
              // On a list page every card is already in THIS list, so no list line.
              <PrimaryCard
                key={b.id}
                url={b.url}
                title={b.title}
                description={b.description}
                imageUrl={b.image_url}
                screenshotUrl={b.screenshot_url}
                faviconUrl={b.favicon_url}
                cardType={b.card_type}
                imagePref={b.image_pref}
                place={b.place}
              />
            ))}
          </Masonry>
        ) : (
          <div className="text-center py-16">
            <p className="text-gray-500 text-sm">empty list</p>
          </div>
        )}
      </div>
      <SiteFooter />
    </main>
  )
}
