'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BookmarkCard } from '@/components/BookmarkCard'
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
}: {
  username: string
  profileId: string
  bio: string | null
  ownerName: string
  initialList: List
  initialBullets: any[]
  initialLists: List[]
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

  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [editingDesc, setEditingDesc] = useState(false)
  const [descValue, setDescValue] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const bullets = memberIds
    .map((id) => bulletsById.get(id))
    .filter(Boolean) as any[]

  // bookmark id → the lists it belongs to (for the card chips).
  const listsByBookmark = (() => {
    const m = new Map<string, { id: string; name: string; slug: string | null }[]>()
    for (const l of lists) {
      for (const bid of l.bookmark_ids) {
        const arr = m.get(bid) || []
        arr.push({ id: l.id, name: l.name, slug: l.slug ?? null })
        m.set(bid, arr)
      }
    }
    return m
  })()

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

  const handleDeleteList = async () => {
    await supabase.from('lists').delete().eq('id', list.id)
    router.push(`/${username}`)
    router.refresh()
  }

  return (
    <>
      <div className="mb-8 border-b border-gray-100 pb-6 sm:mb-10 sm:pb-8">
        <Link href={`/${username}`} className="text-sm text-stone-400 hover:text-ink">
          ← back
        </Link>
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    await handleRename(renameValue)
                    setRenaming(false)
                  } else if (e.key === 'Escape') {
                    setRenaming(false)
                  }
                }}
                onBlur={() => setRenaming(false)}
                className="w-full bg-transparent border-b border-stone-300 pb-1 font-serif text-2xl sm:text-[28px] italic tracking-tight text-ink focus:outline-none focus:border-stone-500"
              />
            ) : (
              <div className="flex items-baseline gap-2 min-w-0">
                <h1 className="truncate font-serif text-2xl sm:text-[28px] font-normal italic tracking-tight text-ink leading-tight">
                  {list.name}
                </h1>
                <button
                  onClick={() => { setRenameValue(list.name); setRenaming(true) }}
                  aria-label="rename list"
                  title="rename"
                  className="shrink-0 text-stone-300 hover:text-ink transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              </div>
            )}

            {editingDesc ? (
              <div className="mt-3">
                <textarea
                  autoFocus
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      await handleUpdateDescription(descValue)
                      setEditingDesc(false)
                    } else if (e.key === 'Escape') {
                      setEditingDesc(false)
                    }
                  }}
                  className="w-full bg-transparent border-b border-stone-300 pb-1 text-sm text-stone-600 focus:outline-none focus:border-stone-500 resize-none"
                  rows={2}
                  placeholder="add a description…"
                />
                <div className="mt-2 flex gap-3">
                  <button
                    onClick={async () => {
                      await handleUpdateDescription(descValue)
                      setEditingDesc(false)
                    }}
                    className="text-xs uppercase tracking-wider text-ink hover:underline"
                  >
                    save
                  </button>
                  <button
                    onClick={() => setEditingDesc(false)}
                    className="text-xs uppercase tracking-wider text-stone-400 hover:text-ink transition-colors"
                  >
                    cancel
                  </button>
                </div>
              </div>
            ) : list.description ? (
              <p
                onClick={() => { setDescValue(list.description || ''); setEditingDesc(true) }}
                className="mt-3 text-sm text-stone-600 cursor-pointer hover:text-ink transition-colors"
              >
                {list.description}
              </p>
            ) : (
              <button
                onClick={() => { setDescValue(''); setEditingDesc(true) }}
                className="mt-3 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                + add description
              </button>
            )}

            <div className="mt-3 flex gap-5 text-xs uppercase tracking-wider text-gray-400">
              <span>
                <span className="text-gray-900 font-medium">{bullets.length}</span>{' '}
                <span>{bullets.length === 1 ? 'bullet' : 'bullets'}</span>
              </span>
              {list.is_private && <span className="text-stone-400">private</span>}
            </div>
          </div>

          {confirmingDelete ? (
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <button
                onClick={handleDeleteList}
                className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-xs text-stone-400 hover:text-ink"
              >
                cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="shrink-0 text-sm text-stone-400 hover:text-red-600"
            >
              delete list
            </button>
          )}
        </div>
      </div>

      {bullets.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-[repeat(auto-fill,272px)] lg:justify-start lg:gap-x-6 lg:gap-y-12">
          {bullets.map((b) => (
            <BookmarkCard
              key={b.id}
              id={b.id}
              title={b.title}
              description={b.description}
              url={b.url}
              imageUrl={b.image_url}
              screenshotUrl={b.screenshot_url}
              faviconUrl={b.favicon_url}
              note={b.note}
              isOwner
              cardType={b.card_type}
              inLists={(listsByBookmark.get(b.id) || []).filter((l) => l.id !== list.id)}
              ownerUsername={username}
              onDelete={handleDelete}
              onNoteUpdate={handleNoteUpdate}
              onOpen={setSelectedId}
            />
          ))}
        </div>
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
