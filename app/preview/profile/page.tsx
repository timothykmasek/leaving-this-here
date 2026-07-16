// PREVIEW-ONLY: the rebrand profile, populated with REAL data (Supabase) so we
// can see actual finds/lists/bio in the new Bulletin design before porting it
// into the production /[username] page. Read-only — no owner controls. Safe to
// delete. Username is hard-coded for the preview.
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LinkCard } from '@/components/LinkCard'
import { BulletinHeader, BracketLabel } from '@/components/BulletinHeader'
import { pickCardImage } from '@/lib/cardImage'

const USERNAME = 'tim'
const MAX_CARDS = 24

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function cleanTitle(title: string | null, url: string): string {
  const domain = domainOf(url)
  const t = (title || '').trim()
  if (!t || t.startsWith('http')) return domain
  if (['home', 'landing', 'index'].includes(t.toLowerCase())) return domain
  return t
}

export default function ProfilePreview() {
  const [profile, setProfile] = useState<any>(null)
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', USERNAME)
        .single()
      if (!prof) { setLoading(false); return }
      setProfile(prof)

      const { data: bmarks } = await supabase
        .from('bookmarks')
        .select('*')
        .eq('user_id', prof.id)
        .order('created_at', { ascending: false })
        .limit(MAX_CARDS)
      setBookmarks(bmarks || [])

      const { data: ls } = await supabase
        .from('lists')
        .select('id, name, list_bookmarks(bookmark_id)')
        .eq('user_id', prof.id)
      setLists(ls || [])
      setLoading(false)
    })()
  }, [])

  // bookmark id → first list name (for the card tag)
  const listNameByBookmark = new Map<string, string>()
  for (const l of lists) {
    for (const lb of l.list_bookmarks || []) {
      if (!listNameByBookmark.has(lb.bookmark_id)) {
        listNameByBookmark.set(lb.bookmark_id, l.name)
      }
    }
  }

  // profile link labels for the strip
  const links = profile?.links || {}
  const linkLabels = ['linkedin', 'website', 'twitter', 'instagram']
    .filter((k) => links[k])
    .map((k) => (k === 'twitter' ? 'x' : k))

  if (loading) {
    return (
      <div className="min-h-screen bg-paper">
        <BulletinHeader />
        <p className="label mt-20 text-center text-black/40">Loading…</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-paper">
        <BulletinHeader />
        <p className="label mt-20 text-center text-black/40">No profile</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-paper">
      <BulletinHeader />

      <main className="px-10 pb-24 pt-10">
        <div className="mx-auto w-[1184px] max-w-full">
          {/* profile info strip — real name / bio / links */}
          <div className="mb-12 flex items-end justify-between text-black/50">
            <div className="flex flex-col gap-[9px]">
              <BracketLabel>{profile.display_name || profile.username}</BracketLabel>
              {profile.bio && <BracketLabel>{profile.bio}</BracketLabel>}
              {linkLabels.length > 0 && (
                <BracketLabel>{linkLabels.join(' · ')}</BracketLabel>
              )}
            </div>
            <div className="flex items-center gap-3">
              <BracketLabel>Recent bullets</BracketLabel>
              <BracketLabel>Lists</BracketLabel>
            </div>
          </div>

          {/* grid — real finds */}
          <div className="grid grid-cols-[repeat(auto-fill,272px)] justify-center gap-x-8 gap-y-12 [perspective:2400px]">
            {bookmarks.map((b) => (
              <LinkCard
                key={b.id}
                url={b.url}
                title={cleanTitle(b.title, b.url)}
                image={pickCardImage(b.url, b.image_url, b.screenshot_url)}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
