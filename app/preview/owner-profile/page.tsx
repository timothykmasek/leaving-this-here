import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import ProfileClient from '@/app/[username]/ProfileClient'

// DEV-ONLY: the real owner profile (ProfileClient, owner view) on real data,
// with every write stubbed (lib/supabase/readOnlyClient) — for walking owner-
// gated changes like bulk select before they ship. 404s in production. The +
// dock is left out: its saves go through /api/import, which the stub can't
// catch.
export const dynamic = 'force-dynamic'

const BULLET_COLS =
  'id, user_id, url, title, description, image_url, screenshot_url, favicon_url, note, card_type, image_pref, is_private, outbound_url, created_at, keywords, place:raw_metadata->place, product:raw_metadata->product, customImage:raw_metadata->customImage'

export default async function OwnerProfilePreview({
  searchParams,
}: {
  searchParams: { u?: string }
}) {
  if (process.env.NODE_ENV === 'production') notFound()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const username = searchParams.u || 'tim'
  const { data: profile } = await admin.from('profiles').select('*').eq('username', username).maybeSingle()
  if (!profile) notFound()
  const [{ data: bookmarks }, { data: lists }] = await Promise.all([
    admin.from('bookmarks').select(BULLET_COLS).eq('user_id', profile.id).order('created_at', { ascending: false }),
    admin
      .from('lists')
      .select('id, name, slug, created_at, list_bookmarks(bookmark_id)')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false }),
  ])
  return (
    <ProfileClient
      username={username}
      initialProfile={profile}
      initialBookmarks={bookmarks || []}
      initialLists={(lists || []).map((l: any) => ({
        ...l,
        bookmark_ids: (l.list_bookmarks || []).map((x: any) => x.bookmark_id),
      }))}
      currentUserId={profile.id}
      mightHaveMore={false}
      readOnlyPreview
    />
  )
}
