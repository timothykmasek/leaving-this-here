'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ListMasthead } from '@/components/ListMasthead'
import { ListCoverControl } from '@/components/ListCoverControl'
import { pickCardImage } from '@/lib/cardImage'
import { PrimaryCard } from '@/components/PrimaryCard'
import { Masonry } from '@/components/Masonry'
import { BulletDetail } from '@/components/BulletDetail'
import { SuggestionShelf, type Suggestion } from '@/components/SuggestionShelf'
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
  updatedAt,
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
  updatedAt: string | null
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

  // Rename and description used to be two independent inline modes (a pencil
  // by the title, click-the-paragraph for the description). In a centred
  // masthead those read as clutter, so both live behind one Edit affordance.
  const [editing, setEditing] = useState(false)
  const [nameValue, setNameValue] = useState('')
  const [descValue, setDescValue] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const bullets = memberIds
    .map((id) => bulletsById.get(id))
    .filter(Boolean) as any[]

  const handleDelete = async (id: string) => {
    await supabase.from('bookmarks').delete().eq('id', id)
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
    // Removing from *this* list drops the bullet from the grid.
    if (listId === list.id && !add) {
      setMemberIds((prev) => prev.filter((x) => x !== bookmarkId))
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
      note: null,
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

  const handleUpdateDescription = async (description: string) => {
    const clean = description.trim()
    await supabase.from('lists').update({ description: clean || null }).eq('id', list.id)
    setList((prev) => ({ ...prev, description: clean || null }))
  }

  // Cover candidates: the image each bullet's CARD actually renders, via the
  // same pickCardImage the cards use — so the picker offers what the owner has
  // been looking at, not a different field they've never seen. Deduped, and
  // capped because the picker samples every one of these to rank them.
  const coverCandidates = useMemo(() => {
    const seen = new Set<string>()
    for (const b of bullets) {
      const img = pickCardImage(b.url, b.image_url, b.screenshot_url, b.card_type, b.image_pref)
      if (img) seen.add(img)
      if (seen.size >= 12) break
    }
    return [...seen]
  }, [bullets])

  const handleDeleteList = async () => {
    await supabase.from('lists').delete().eq('id', list.id)
    router.push(`/${username}`)
    router.refresh()
  }

  return (
    <>
      {editing ? (
        // Mirrors ListMasthead's metrics — left-aligned, name at Mier 20/600,
        // description in the Cardo editorial slot — so switching into edit
        // doesn't reflow the page around you. 6 rows because the description is
        // now real prose, not the one-liner the old centred hero assumed.
        <div className="pb-8 pt-2">
          <input
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
            aria-label="List name"
            className="w-full max-w-[640px] border-b border-black/15 bg-transparent pb-1 font-sans text-[20px] font-[600] leading-[24px] text-ink focus:border-black/40 focus:outline-none"
          />

          <textarea
            value={descValue}
            onChange={(e) => setDescValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false) }}
            rows={6}
            placeholder="What is this list for? Why these links, and who is it for?"
            aria-label="List description"
            className="mt-4 block w-full max-w-[640px] resize-y border-b border-black/15 bg-transparent pb-1 font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60 placeholder:text-black/30 focus:border-black/40 focus:outline-none"
          />

          <div className="mt-6 flex flex-wrap items-center gap-5">
            {/* handleRename no-ops on an empty name, so without this the panel
                would close having silently kept the old one. */}
            <button
              disabled={!nameValue.trim()}
              onClick={async () => {
                await handleRename(nameValue)
                await handleUpdateDescription(descValue)
                setEditing(false)
              }}
              className="label rounded-full bg-ink px-4 py-2 text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Save
            </button>
            <button onClick={() => setEditing(false)} className="label text-ink/[0.45] transition-colors hover:text-ink">
              Cancel
            </button>
            {confirmingDelete ? (
              <span className="flex items-center gap-3">
                <button onClick={handleDeleteList} className="label text-red-600 hover:underline">
                  Delete for good
                </button>
                <button onClick={() => setConfirmingDelete(false)} className="label text-ink/[0.45] hover:text-ink">
                  Keep
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="label text-ink/[0.45] transition-colors hover:text-red-600"
              >
                Delete list
              </button>
            )}
          </div>
        </div>
      ) : (
        <ListMasthead
          name={list.name}
          description={list.description}
          count={bullets.length}
          updatedAt={updatedAt}
          ownerName={ownerName}
          backHref={backHref}
          backLabel="&larr; All lists"
          coverUrl={list.cover_image_url}
          stripThumbs={stripThumbs}
          isPrivate={list.is_private}
          coverControl={
            <ListCoverControl
              listId={list.id}
              hasCover={!!list.cover_image_url}
              usingDefault={list.cover_image_url == null}
              candidates={coverCandidates}
              onChange={(url) => setList((prev) => ({ ...prev, cover_image_url: url }))}
            />
          }
          editControl={
            // Same pencil, same 14px, as the profile's own edit affordance.
            <button
              onClick={() => {
                setNameValue(list.name)
                setDescValue(list.description || '')
                setConfirmingDelete(false)
                setEditing(true)
              }}
              aria-label="Edit list name and description"
              title="Edit list name and description"
              className="inline-flex text-current transition-colors hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
              </svg>
            </button>
          }
        />
      )}

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
              onOpen={setSelectedId}
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
      <SuggestionShelf listId={list.id} onAdd={handleAddSuggestion} />

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
          />
        )
      })()}
    </>
  )
}
