'use client'

import { useState, useRef, useEffect } from 'react'

interface BookmarkCardProps {
  id: string
  title: string | null
  description: string | null
  url: string
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl: string | null
  tags: string[]
  allTags: string[]
  isOwner: boolean
  isPrivate: boolean
  onDelete?: (id: string) => void
  onPrivacyToggle?: (id: string, isPrivate: boolean) => void
  onTagsUpdate?: (id: string, tags: string[]) => void
}

function getGradient(url: string): string {
  const gradients = [
    'from-stone-100 to-stone-50',
    'from-zinc-100 to-zinc-50',
    'from-neutral-100 to-neutral-50',
    'from-slate-100 to-slate-50',
    'from-gray-100 to-gray-50',
    'from-stone-100 to-zinc-50',
    'from-neutral-100 to-stone-50',
    'from-slate-100 to-gray-50',
  ]
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i)
    hash = hash & hash
  }
  return gradients[Math.abs(hash) % gradients.length]
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', '') } catch { return url }
}

function getCleanTitle(title: string | null, url: string): string {
  const domain = getDomain(url)
  if (!title) return domain
  const cleaned = title.trim()
  if (!cleaned) return domain
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return domain
  if (['home', 'landing', 'index'].includes(cleaned.toLowerCase())) return domain
  return cleaned
}

export function BookmarkCard({
  id, title, description, url, imageUrl, screenshotUrl, faviconUrl,
  tags, allTags, isOwner, isPrivate, onDelete, onPrivacyToggle, onTagsUpdate,
}: BookmarkCardProps) {
  const [imgError, setImgError] = useState(false)
  const [screenshotFallback, setScreenshotFallback] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const menuRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const tagEditorRef = useRef<HTMLDivElement>(null)

  // Always try to fetch a live screenshot for the most visual result
  useEffect(() => {
    if (!screenshotFallback) {
      fetch(`https://api.microlink.io?url=${encodeURIComponent(url)}&screenshot=true&meta=false`)
        .then(r => r.json())
        .then(data => {
          const ssUrl = data?.data?.screenshot?.url
          if (ssUrl) setScreenshotFallback(ssUrl)
        })
        .catch(() => {})
    }
  }, [url, screenshotFallback])

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  // Close tag editor on outside click
  useEffect(() => {
    if (!editingTags) return
    const handleClick = (e: MouseEvent) => {
      if (tagEditorRef.current && !tagEditorRef.current.contains(e.target as Node)) {
        setEditingTags(false)
        if (JSON.stringify(localTags) !== JSON.stringify(tags)) {
          onTagsUpdate?.(id, localTags)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [editingTags, localTags, tags, id, onTagsUpdate])

  // Focus tag input when opening editor
  useEffect(() => {
    if (editingTags) tagInputRef.current?.focus()
  }, [editingTags])

  // Sync local tags with prop
  useEffect(() => { setLocalTags(tags) }, [tags])

  const addTag = (tag: string) => {
    const cleaned = tag.toLowerCase().trim()
    if (cleaned && !localTags.includes(cleaned)) {
      const next = [...localTags, cleaned]
      setLocalTags(next)
      onTagsUpdate?.(id, next)
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    const next = localTags.filter(t => t !== tag)
    setLocalTags(next)
    onTagsUpdate?.(id, next)
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (tagInput.trim()) addTag(tagInput)
    } else if (e.key === 'Backspace' && !tagInput && localTags.length > 0) {
      removeTag(localTags[localTags.length - 1])
    } else if (e.key === 'Escape') {
      setEditingTags(false)
    }
  }

  // Auto-suggest: tags that exist globally but aren't on this card
  const suggestions = tagInput.trim()
    ? allTags.filter(t => t.includes(tagInput.toLowerCase().trim()) && !localTags.includes(t)).slice(0, 5)
    : []

  // Prefer live screenshot > saved screenshot > OG image
  const displayImage = screenshotFallback || (!imgError ? (screenshotUrl || imageUrl) : null)
  const gradient = getGradient(url)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="relative group">
      <a href={url} target="_blank" rel="noopener noreferrer">
        <div className="flex flex-col bg-white border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all overflow-hidden rounded-xl isolate">
          {/* Hero image */}
          <div className={`relative w-full aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradient}`}>
            {displayImage ? (
              <img
                src={displayImage}
                alt={cleanTitle}
                className="w-full h-full object-cover object-top"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
                {faviconUrl && !imgError ? (
                  <img
                    src={faviconUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl opacity-60"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ) : (
                  <span className="text-3xl font-light text-gray-300 select-none">
                    {domain.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-xs text-gray-400 font-medium tracking-wide">{domain}</span>
              </div>
            )}

            {isPrivate && (
              <div className="absolute top-2 left-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
                private
              </div>
            )}
          </div>

          {/* Caption + tags */}
          <div className="px-3 py-2.5">
            <h3 className="font-medium text-gray-900 line-clamp-1 text-sm leading-snug">
              {cleanTitle}
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">{domain}</p>
            {localTags.length > 0 && !editingTags && (
              <div className="flex gap-1 flex-wrap mt-1.5">
                {localTags.map(tag => (
                  <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </a>

      {/* Tag editor — appears below the card */}
      {editingTags && (
        <div ref={tagEditorRef} className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50">
          <div className="flex flex-wrap gap-1 mb-2">
            {localTags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                {tag}
                <button
                  onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
                  className="text-gray-400 hover:text-gray-600 leading-none"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
          <div className="relative">
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value.replace(',', ''))}
              onKeyDown={handleTagKeyDown}
              placeholder={localTags.length === 0 ? 'add a tag...' : 'add another...'}
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
            />
            {suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-md z-50">
                {suggestions.map(s => (
                  <button
                    key={s}
                    onClick={(e) => { e.stopPropagation(); addTag(s) }}
                    className="w-full text-left px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Owner menu */}
      {isOwner && (
        <div className="absolute top-2 right-2" ref={menuRef}>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(!menuOpen) }}
            className="w-7 h-7 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ opacity: menuOpen ? 1 : undefined }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = '1' }}
            onMouseLeave={(e) => { if (!menuOpen) (e.target as HTMLElement).style.opacity = '' }}
          >
            ···
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenuOpen(false)
                  setEditingTags(true)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                edit tags
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onPrivacyToggle?.(id, !isPrivate)
                  setMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {isPrivate ? 'make public' : 'make private'}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onDelete?.(id)
                  setMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50 transition-colors"
              >
                delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
