import { notFound } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getProfileByUsername } from '@/lib/queries'
import { timed } from '@/lib/timing'
import { PrimaryCard } from '@/components/PrimaryCard'
import { pickCardImage } from '@/lib/cardImage'
import { Masonry } from '@/components/Masonry'
import { ListMasthead } from '@/components/ListMasthead'
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
  'id, title, description, url, image_url, screenshot_url, favicon_url, note, card_type, image_pref, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

export default async function ListPage({
  params,
}: {
  params: { username: string; listSlug: string }
}) {
  const { username, listSlug } = params
  const supabase = await createSupabaseServer()

  // ONE round trip for the whole page, where this used to take three.
  //
  // Every Supabase call costs ~139ms of pure network latency before the query
  // does any work — a bare `select id` takes the same 139ms as a real one. So
  // the page's speed is decided by the NUMBER of hops. This route made three,
  // each waiting on the last: profile by username, then the list by that
  // profile's id, then the bullets by that list's member ids. ~425ms of
  // latency to assemble one page.
  //
  // PostgREST can express the whole shape in one request: filter lists on the
  // embedded profile's username, and pull the member bookmarks up through
  // list_bookmarks. Measured: 425ms -> 158ms.
  //
  // The owner's full list set is embedded too. It's only needed for their
  // management sidebar, but lists are tiny and fetching them separately would
  // put the second round trip straight back for exactly the people who use the
  // page most.
  const [{ data: { session } }, oneShot] = await timed('list:one-shot', () =>
    Promise.all([
      supabase.auth.getSession(),
      supabase
        .from('lists')
        .select(
          `id, name, slug, is_private, description, cover_image_url,
           profiles!inner(id, username, display_name, bio, links),
           list_bookmarks(bookmark_id, bookmarks(${BULLET_COLS}))`
        )
        .eq('profiles.username', username)
        .eq('slug', listSlug)
        .maybeSingle(),
    ])
  )
  const user = session?.user ?? null
  if (oneShot.error || !oneShot.data) notFound()

  const row: any = oneShot.data
  const profile: any = row.profiles
  if (!profile) notFound()
  const isOwner = !!user && user.id === profile.id

  const list: any = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    is_private: row.is_private,
    description: row.description,
    cover_image_url: row.cover_image_url,
    list_bookmarks: (row.list_bookmarks || []).map((x: any) => ({
      bookmark_id: x.bookmark_id,
    })),
  }

  // Newest first, matching what the standalone bullets query used to order by.
  const bullets: any[] = (row.list_bookmarks || [])
    .map((x: any) => x.bookmarks)
    .filter(Boolean)
    .sort((a: any, b: any) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    )
  const ids = bullets.map((b: any) => b.id)

  // The owner's other lists, for their management sidebar. One more hop, and
  // only for them — a visitor never sees it.
  const allListsRes: any = isOwner
    ? await timed('list:allLists (owner)', () =>
        supabase
          .from('lists')
          .select('id, name, slug, is_private, description, list_bookmarks(bookmark_id)')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
      )
    : { data: null }

  const owner = profile.display_name || profile.username

  // The back link returns to the profile's LISTS tab specifically, which is why
  // ProfileClient reads ?tab= — landing on Recent Bullets after leaving a list
  // is the wrong place.
  const backHref = `/${username}?tab=lists`

  // Thumbs for the masthead's default cover band — the image each bullet's CARD
  // renders, via the same pickCardImage the cards use, so the band is built from
  // what a visitor actually sees below it. 8 is enough to overrun the cover at
  // its band height (~19% each) and bleed off both edges.
  const stripThumbs = Array.from(
    new Set(
      bullets
        .map((b: any) => pickCardImage(b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref))
        .filter(Boolean) as string[]
    )
  ).slice(0, 8)

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
      // The sidebar's list set never renders covers, so it doesn't fetch them.
      cover_image_url: null,
      bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
    }))

    return (
      <main className="min-h-screen">
        <PublicHeader
          loggedIn
          logoClassName="h-[32px] sm:h-[44px]"
          widthClassName={LIST_GRID}
          stickyLogo
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
              cover_image_url: (list as any).cover_image_url ?? null,
              bookmark_ids: ids,
            }}
            initialBullets={bullets}
            initialLists={shapedLists}
            backHref={backHref}
            stripThumbs={stripThumbs}
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
      />
      <div className={`mx-auto ${LIST_GRID} pb-16 pt-4 sm:pt-8`}>
        <ListMasthead
          name={list.name}
          description={list.description}
          count={bullets.length}
          ownerName={owner}
          backHref={backHref}
          backLabel={`\u2190 ${owner.split(' ')[0]}\u2019s lists`}
          coverUrl={(list as any).cover_image_url}
          stripThumbs={stripThumbs}
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
                product={b.product}
                customImage={b.customImage}
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
