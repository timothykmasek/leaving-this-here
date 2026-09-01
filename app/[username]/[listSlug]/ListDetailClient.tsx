'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ListMasthead } from '@/components/ListMasthead'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { BulletDetail } from '@/components/BulletDetail'
import { SuggestionShelf, forgetSuggestion, type Suggestion } from '@/components/SuggestionShelf'
import { uniqueSlug } from '@/lib/slug'

// Owner-editing island for a list at /username/<slug>. Visitors get the plain
// server-rendered read-only page; the owner gets this instead, which ports the
// profile's in-page list controls (rename, delete, edit description, and
// per-bullet management via the detail modal) onto the list's own URL — so
// clicking a list from the profile navigates straight here without losing any
// of the owner affordances.

type List = {
  id: string
  name: string
  slug: string | null
  is_private: boolean
  description: string | null
  cover_image_url: string | null
  bookmark_ids: string[]
}

export function ListDetailClient({
  username,
  profileId,
  bio,
  ownerName,
  initialList,
  initialBullets,
  initialLists,
  backHref,
  stripThumbs,
}: {
  username: string
  profileId: string
  bio: string | null
  ownerName: string
  initialList: List
  initialBullets: any[]
  initialLists: List[]
  /** ISO timestamp of the most recent add — derived server-side. */
  backHref: string
  /** Thumbs for the masthead's default cover band, built server-side. */
  stripThumbs: string[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [list, setList] = useState<List>(initialList)
  // All bullets ever fetched for this list, keyed for lookup. `memberIds` is the
  // live membership set — removing a bullet from this list drops it from the grid.
  const [bulletsById] = useState(
    () => new Map(initialBullets.map((b) => [b.id, b]))
  )
  const [memberIds, setMemberIds] = useState<string[]>(initialList.bookmark_ids)
  const [lists, setLists] = useState<List[]>(initialLists)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const bullets = memberIds
    .map((id) => bulletsById.get(id))
    .filter(Boolean) as any[]

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
    forgetSuggestion(id)
    setMemberIds((prev) => prev.filter((x) => x !== id))
    setLists((prev) =>
      prev.map((l) => ({ ...l, bookmark_ids: l.bookmark_ids.filter((x) => x !== id) }))
    )
  }

  const handleNoteUpdate = async (id: string, newNote: string | null) => {
    await supabase.from('bookmarks').update({ note: newNote }).eq('id', id)
    const b = bulletsById.get(id)
    if (b) bulletsById.set(id, { ...b, note: newNote })
  }

  // Flip a bullet between public and secret. Same in-place idiom as note/title
  // above: the modal shows the flip via its own local state, and the grid's
  // lock chip catches up on the next render (closing the modal).
  const handleToggleVisibility = async (id: string, isPrivate: boolean) => {
    const b = bulletsById.get(id)
    if (b) bulletsById.set(id, { ...b, is_private: isPrivate })
    await supabase.from('bookmarks').update({ is_private: isPrivate }).eq('id', id)
  }

  // A hand-edited title wins outright at render time (lib/cardTitle), so
  // whatever gets typed here is exactly what the card shows from now on.
  const handleTitleUpdate = async (id: string, newTitle: string) => {
    const b = bulletsById.get(id)
    if (b) bulletsById.set(id, { ...b, title: newTitle })
    await supabase.from('bookmarks').update({ title: newTitle }).eq('id', id)
  }

  const handleToggleMembership = async (
    listId: string,
    bookmarkId: string,
    add: boolean
  ) => {
    if (add) {
      await supabase.from('list_bookmarks').insert({ list_id: listId, bookmark_id: bookmarkId })
    } else {
      await supabase
        .from('list_bookmarks')
        .delete()
        .eq('list_id', listId)
        .eq('bookmark_id', bookmarkId)
    }
    setLists((prev) =>
      prev.map((l) =>
        l.id === listId
          ? {
              ...l,
              bookmark_ids: add
                ? [...l.bookmark_ids, bookmarkId]
                : l.bookmark_ids.filter((x) => x !== bookmarkId),
            }
          : l
      )
    )
    // Keep the grid in step with membership in THIS list, both directions. The
    // add case matters now that the shelf's cards open in the detail modal: you
    // can be looking at a bullet that ISN'T yet a member and file it from there.
    if (listId === list.id) {
      setMemberIds((prev) =>
        add
          ? prev.includes(bookmarkId) ? prev : [bookmarkId, ...prev]
          : prev.filter((x) => x !== bookmarkId)
      )
    }
  }

  // Ambient shelf: file a suggested bullet into THIS list. Reuses the same
  // list_bookmarks insert as manual filing, then drops it into the grid + count
  // so the page reflects the add without a reload.
  const handleAddSuggestion = async (s: Suggestion) => {
    const { error } = await supabase
      .from('list_bookmarks')
      .insert({ list_id: list.id, bookmark_id: s.id })
    // 23505 = already a member (raced/dupe) — treat as success, not a failure.
    if (error && error.code !== '23505') throw error

    bulletsById.set(s.id, {
      id: s.id,
      title: s.title,
      description: s.description,
      url: s.url,
      image_url: s.image_url,
      screenshot_url: s.screenshot_url,
      favicon_url: s.favicon_url,
      note: s.note,
      created_at: s.created_at,
      card_type: s.card_type,
    })
    setMemberIds((prev) => (prev.includes(s.id) ? prev : [s.id, ...prev]))
    setLists((prev) =>
      prev.map((l) =>
        l.id === list.id && !l.bookmark_ids.includes(s.id)
          ? { ...l, bookmark_ids: [...l.bookmark_ids, s.id] }
          : l
      )
    )
  }

  // Open a SHELF suggestion in the detail modal. The modal resolves bullets out
  // of bulletsById, and a suggestion is by definition not a member of this list
  // — so register it first, or the modal resolves nothing and silently no-ops.
  // Registering also means filing it from inside the modal renders immediately,
  // since the grid can then find it.
  const handleOpenSuggestion = (s: Suggestion) => {
    if (!bulletsById.has(s.id)) {
      bulletsById.set(s.id, {
        id: s.id,
        title: s.title,
        description: s.description,
        url: s.url,
        image_url: s.image_url,
        screenshot_url: s.screenshot_url,
        favicon_url: s.favicon_url,
        note: s.note,
        created_at: s.created_at,
        card_type: s.card_type,
      })
    }
    setSelectedId(s.id)
  }

  const handleCreateList = async (name: string, bookmarkIds: string[] = []) => {
    const clean = name.trim()
    if (!clean) return null
    const slug = uniqueSlug(clean, lists.map((l) => l.slug).filter(Boolean) as string[])

    let description: string | null = null
    try {
      const genRes = await fetch('/api/generate-list-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bio: bio || '', listName: clean }),
      })
      const genData = await genRes.json()
      description = genData.description
    } catch {
      // proceed without description
    }

    let { data: created, error } = await supabase
      .from('lists')
      .insert({ user_id: profileId, name: clean, slug, description })
      .select('id, name, slug, is_private, description')
      .single()
    if (error && /slug/i.test(error.message || '')) {
      const retry = await supabase
        .from('lists')
        .insert({ user_id: profileId, name: clean, description })
        .select('id, name, slug, is_private, description')
        .single()
      created = retry.data
      error = retry.error
    }
    if (error || !created) return null
    if (bookmarkIds.length) {
      await supabase
        .from('list_bookmarks')
        .insert(bookmarkIds.map((bid) => ({ list_id: created!.id, bookmark_id: bid })))
    }
    setLists((prev) => [
      ...prev,
      { ...(created as any), bookmark_ids: bookmarkIds },
    ])
    return created.id as string
  }

  const handleRename = async (name: string) => {
    const clean = name.trim()
    if (!clean) return
    await supabase.from('lists').update({ name: clean }).eq('id', list.id)
    setList((prev) => ({ ...prev, name: clean }))
  }

  const handleDeleteList = async () => {
    await supabase.from('lists').delete().eq('id', list.id)
    router.push(`/${username}`)
    router.refresh()
  }

  return (
    <>
      {/* The masthead IS the editor now: the owner clicks the poster title to
          rename in place, and delete rides the meta row behind a confirm. The
          old panel (name input + description textarea + save row) went with
          descriptions — one job left, done where the title already is. */}
      <ListMasthead
        name={list.name}
        count={bullets.length}
        backHref={backHref}
        backLabel="&larr; All lists"
        isPrivate={list.is_private}
        onRename={handleRename}
        onDelete={handleDeleteList}
      />

      {bullets.length > 0 ? (
        <Masonry>
          {bullets.map((b) => (
            // Every card is already in THIS list, so no list line.
            <PrimaryCard
              key={b.id}
              id={b.id}
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
              onOpen={setSelectedId}
              utmCampaign={username}
              privateMark={!!b.is_private}
            />
          ))}
        </Masonry>
      ) : (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm">
            empty list — open a bullet and add it to this list
          </p>
        </div>
      )}

      {/* Ambient shelf — suggests other saved links that fit this list. Renders
          nothing until it has confident suggestions, so it's fully ignorable. */}
      <SuggestionShelf
        listId={list.id}
        onAdd={handleAddSuggestion}
        onOpen={handleOpenSuggestion}
      />

      {selectedId && (() => {
        const bullet = bulletsById.get(selectedId)
        if (!bullet) return null
        return (
          <BulletDetail
            bullet={bullet}
            lists={lists}
            onClose={() => setSelectedId(null)}
            onNoteUpdate={handleNoteUpdate}
            onDelete={handleDelete}
            onToggleListMembership={handleToggleMembership}
            onCreateList={handleCreateList}
            onToggleVisibility={handleToggleVisibility}
            onTitleUpdate={handleTitleUpdate}
            utmCampaign={username}
          />
        )
      })()}
    </>
  )
}
