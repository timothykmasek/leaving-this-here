'use client'

import { useState, useEffect, useRef } from 'react'
import { GemGlyph } from '@/components/GemGlyph'

// Mymind-style detail view for a single gem. Two panes: a large preview on the
// left, and metadata on the right — tags (view + edit), notes, and a delete
// action. Rendered as an overlay; closes on backdrop click or Escape. Editing
// flows through the same handlers the profile page uses, so changes persist and
// the grid stays in sync.

interface Gem {
  id: string
  title: string | null
  description: string | null
  url: string
  image_url: string | null
  screenshot_url: string | null
  favicon_url: string | null
  tags: string[] | null
  note: string | null
  created_at: string | null
}

interface List {
  id: string
  name: string
  bookmark_ids: string[]
}

interface GemDetailProps {
  gem: Gem
  allTags?: string[]
  lists?: List[]
  onClose: () => void
  onTagsUpdate: (id: string, tags: string[]) => void
  onNoteUpdate: (id: string, note: string | null) => void
  onDelete: (id: string) => void
  onToggleListMembership?: (listId: string, bookmarkId: string, add: boolean) => void
  onCreateList?: (name: string, bookmarkIds?: string[]) => Promise<string | null>
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)} years ago`
}

export function GemDetail({
  gem,
  allTags = [],
  lists = [],
  onClose,
  onTagsUpdate,
  onNoteUpdate,
  onDelete,
  onToggleListMembership,
  onCreateList,
}: GemDetailProps) {
  const [tags, setTags] = useState<string[]>(gem.tags || [])
  const [tagInput, setTagInput] = useState('')
  const [suggestIndex, setSuggestIndex] = useState(-1)
  const [noteDraft, setNoteDraft] = useState(gem.note || '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [newListName, setNewListName] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  const domain = getDomain(gem.url)
  const preview = (!imgError && (gem.screenshot_url || gem.image_url)) || null

  // Reset local state when switching to a different gem.
  useEffect(() => {
    setTags(gem.tags || [])
    setNoteDraft(gem.note || '')
    setTagInput('')
    setConfirmingDelete(false)
    setImgError(false)
  }, [gem.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes; lock body scroll while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const suggestions = tagInput
    ? allTags.filter(
        (t) => t.toLowerCase().includes(tagInput.toLowerCase()) && !tags.includes(t)
      )
    : []

  const commitTags = (next: string[]) => {
    setTags(next)
    onTagsUpdate(gem.id, next)
  }

  const addTag = (raw: string) => {
    const clean = raw.toLowerCase().trim()
    if (clean && !tags.includes(clean)) commitTags([...tags, clean])
    setTagInput('')
    setSuggestIndex(-1)
  }

  const removeTag = (tag: string) => commitTags(tags.filter((t) => t !== tag))

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (suggestIndex >= 0 && suggestions[suggestIndex]) addTag(suggestions[suggestIndex])
      else if (tagInput.trim()) addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestIndex(Math.min(suggestIndex + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestIndex(Math.max(suggestIndex - 1, -1))
    }
  }

  const saveNote = () => {
    const cleaned = noteDraft.trim()
    const next = cleaned.length ? cleaned : null
    if (next !== (gem.note || null)) onNoteUpdate(gem.id, next)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 backdrop-blur-sm p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative flex w-full max-w-5xl max-h-[88vh] flex-col overflow-hidden rounded-xl border border-[#26221c]/40 bg-paper shadow-2xl md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-paper/80 text-stone-500 hover:text-ink hover:bg-paper transition-colors"
        >
          ✕
        </button>

        {/* Left — preview */}
        <div className="relative flex w-full items-center justify-center bg-[#ece6d8] md:w-[58%]">
          {preview ? (
            <img
              src={preview}
              alt={gem.title || domain}
              className="h-56 w-full object-cover md:h-full md:max-h-[88vh]"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="flex h-56 w-full items-center justify-center md:h-full">
              <GemGlyph className="h-12 w-12 text-ink/20" />
            </div>
          )}
          <a
            href={gem.url}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-paper hover:bg-ink/85 transition-colors"
          >
            {gem.favicon_url && (
              <img src={gem.favicon_url} alt="" className="h-3.5 w-3.5 rounded-sm" />
            )}
            visit {domain}
            <span aria-hidden>↗</span>
          </a>
        </div>

        {/* Right — meta */}
        <div className="flex w-full flex-col overflow-y-auto p-6 md:w-[42%]">
          <h2 className="font-serif text-xl font-normal leading-snug tracking-tight text-ink">
            {gem.title || domain}
          </h2>
          <p className="mt-1.5 text-xs uppercase tracking-[0.13em] text-stone-500">
            {timeAgo(gem.created_at)}
            {gem.created_at && ' · '}
            {domain}
          </p>

          {/* Tags */}
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
              tags
            </p>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-white border border-[#26221c]/15 px-2.5 py-1 text-xs text-ink"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    aria-label={`remove ${tag}`}
                    className="text-stone-400 hover:text-red-600"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="relative mt-2">
              <input
                ref={tagInputRef}
                type="text"
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value)
                  setSuggestIndex(-1)
                }}
                onKeyDown={handleTagKeyDown}
                placeholder={tags.length ? 'add a tag…' : 'add tags…'}
                className="w-full rounded-lg border border-[#26221c]/15 bg-white px-3 py-2 text-sm focus:border-ink/50 focus:outline-none"
              />
              {suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-32 overflow-y-auto rounded-lg border border-[#26221c]/15 bg-white shadow-lg">
                  {suggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => addTag(s)}
                      className={`block w-full px-3 py-1.5 text-left text-xs transition-colors ${
                        i === suggestIndex ? 'bg-stone-100 text-ink' : 'text-stone-600 hover:bg-stone-50'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Lists */}
          {onToggleListMembership && (
            <div className="mt-6">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
                lists
              </p>
              {lists.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {lists.map((l) => {
                    const inList = l.bookmark_ids.includes(gem.id)
                    return (
                      <button
                        key={l.id}
                        onClick={() => onToggleListMembership(l.id, gem.id, !inList)}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors ${
                          inList
                            ? 'bg-ink text-paper'
                            : 'border border-[#26221c]/15 bg-white text-ink hover:border-ink/40'
                        }`}
                      >
                        {inList && <span aria-hidden>✓</span>}
                        {l.name}
                      </button>
                    )
                  })}
                </div>
              )}
              {onCreateList && (
                <input
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && newListName.trim()) {
                      await onCreateList(newListName, [gem.id])
                      setNewListName('')
                    }
                  }}
                  placeholder="+ new list (press enter)"
                  className="mt-2 w-full rounded-lg border border-[#26221c]/15 bg-white px-3 py-2 text-sm focus:border-ink/50 focus:outline-none"
                />
              )}
            </div>
          )}

          {/* Notes */}
          <div className="mt-6">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-stone-400">
              notes
            </p>
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={saveNote}
              placeholder="why this one's a gem…"
              rows={4}
              maxLength={280}
              className="w-full resize-none rounded-lg border border-[#26221c]/15 bg-white px-3 py-2 text-sm leading-relaxed focus:border-ink/50 focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="mt-auto flex items-center justify-between pt-6">
            {confirmingDelete ? (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-stone-500">delete this gem?</span>
                <button
                  onClick={() => {
                    onDelete(gem.id)
                    onClose()
                  }}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                >
                  delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="text-xs text-stone-500 hover:text-ink"
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-red-600 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
