'use client'

import { useState, useRef, useEffect } from 'react'
import { pickProduct, pickBook } from '@/lib/metadata'
import { detectEmbed } from '@/lib/rich-embed'
import { RichEmbedCard } from '@/components/RichEmbed'
import { GemGlyph } from '@/components/GemGlyph'

interface BookmarkCardProps {
  id: string
  title: string | null
  description: string | null
  url: string
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl: string | null
  rawMetadata?: any
  tags: string[]
  allTags?: string[]
  note?: string | null
  isOwner: boolean
  cardType?:
    | 'composite'
    | 'fullbleed'
    | 'screenshot'
    | 'profile'
    | 'product'
    | 'article'
    | 'book'
    | 'lth'
    | null
  onDelete?: (id: string) => void
  onTagsUpdate?: (id: string, tags: string[]) => void
  onNoteUpdate?: (id: string, note: string | null) => void
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
  try { return new URL(url).hostname.replace('www.', '') } catch (e) { return url }
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

function getBrandColors(domain: string): { bg: string; text: string; gradient: string } {
  const colors: Record<string, { bg: string; text: string; gradient: string }> = {
    instagram: {
      bg: 'bg-gradient-to-br from-purple-400 via-pink-500 to-red-500',
      text: 'text-white',
      gradient: 'from-purple-400 via-pink-500 to-red-500',
    },
    twitter: {
      bg: 'bg-[#1da1f2]',
      text: 'text-white',
      gradient: '#1da1f2',
    },
    x: {
      bg: 'bg-black',
      text: 'text-white',
      gradient: 'from-black to-gray-900',
    },
    linkedin: {
      bg: 'bg-[#0a66c2]',
      text: 'text-white',
      gradient: '#0a66c2',
    },
    tiktok: {
      bg: 'bg-gradient-to-br from-black via-gray-900 to-black',
      text: 'text-white',
      gradient: 'from-black via-gray-900 to-black',
    },
    pinterest: {
      bg: 'bg-[#e60023]',
      text: 'text-white',
      gradient: '#e60023',
    },
    threads: {
      bg: 'bg-black',
      text: 'text-white',
      gradient: 'from-black to-gray-900',
    },
  }

  const domainLower = domain.toLowerCase()
  for (const [key, value] of Object.entries(colors)) {
    if (domainLower.includes(key)) {
      return value
    }
  }

  return {
    bg: 'bg-gradient-to-br from-gray-100 to-gray-50',
    text: 'text-gray-600',
    gradient: 'from-gray-100 to-gray-50',
  }
}

// Shared card frame (full ink keyline + faint shadow) and footer, so every
// card type is framed identically — image AND title/domain inside one border.
const CARD_FRAME =
  'bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 hover:border-[#26221c]/60 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-all'

function CardFooter({ title, url }: any) {
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  return (
    <div className="px-4 pt-3 pb-3">
      <h3 className="font-serif font-medium text-ink line-clamp-2 text-[15px] leading-snug tracking-tight">
        {cleanTitle}
      </h3>
      <p className="text-[10px] uppercase tracking-[0.13em] text-stone-500 font-serif mt-1.5">{domain}</p>
    </div>
  )
}

function CompositeCard({ imageUrl, title, faviconUrl, url }: any) {
  const [imgError, setImgError] = useState(false)
  const [heroError, setHeroError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 hover:border-[#26221c]/60 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-all">
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        {faviconUrl && !imgError ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-200 flex items-center justify-center text-gray-400 text-[9px] font-medium">
            {domain.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-[10px] uppercase tracking-[0.13em] text-stone-500 font-serif truncate">{domain}</span>
      </div>

      <div className="px-4 pb-3">
        <h3 className="font-serif font-medium text-[16px] leading-[1.25] text-ink line-clamp-3 tracking-tight">
          {cleanTitle}
        </h3>
      </div>

      {imageUrl && !heroError && (
        <div className="relative aspect-[16/10] bg-gray-50 overflow-hidden mx-3 mb-3">
          <img
            src={imageUrl}
            alt={cleanTitle}
            className="w-full h-full object-cover"
            onError={() => setHeroError(true)}
          />
        </div>
      )}
    </div>
  )
}

function FullbleedCard({ imageUrl, title, url }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)

  if (!imageUrl || imgError) {
    return <GemFallbackCard title={title} url={url} cardType="fullbleed" />
  }

  return (
    <div className={CARD_FRAME}>
      <div className="relative w-full aspect-[4/3] overflow-hidden bg-white">
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      </div>
      <CardFooter title={title} url={url} />
    </div>
  )
}

function ScreenshotCard({ imageUrl, title, url }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)
  const gradient = getGradient(url)

  // No screenshot, or it failed to load (dead domain, blocked, expired
  // cache) → render the branded fallback instead of a permanent "loading…".
  if (!imageUrl || imgError) {
    return <GemFallbackCard title={title} url={url} cardType="screenshot" />
  }

  return (
    <div className={CARD_FRAME}>
      <div className={`relative w-full aspect-[4/3] overflow-hidden bg-gradient-to-br ${gradient}`}>
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
      <CardFooter title={title} url={url} />
    </div>
  )
}

function ProductCard({ imageUrl, title, url, priceFormatted }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 hover:border-[#26221c]/60 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-all">
      <div className="relative aspect-[4/3] bg-gray-50 overflow-hidden">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl}
            alt={cleanTitle}
            className="w-full h-full object-contain p-6"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-gray-400">no image</span>
          </div>
        )}

        {priceFormatted && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm border border-stone-200/80 text-gray-900 text-[12px] font-semibold px-2.5 py-1 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {priceFormatted}
          </div>
        )}
      </div>

      <div className="px-4 py-3 text-center">
        <h3 className="font-serif text-[14px] text-ink line-clamp-2 tracking-tight">
          {cleanTitle}
        </h3>
      </div>
    </div>
  )
}

/**
 * Branded fallback — used whenever we have no usable image (paywall, logo-only
 * OG, dead screenshot). A muted panel with the small line-gem mark + footer.
 */
function GemFallbackCard({ title, url }: any) {
  return (
    <div className={CARD_FRAME}>
      <div className="flex aspect-[4/3] items-center justify-center" style={{ backgroundColor: '#ece6d8' }}>
        <GemGlyph className="h-8 w-8 text-ink/20" />
      </div>
      <CardFooter title={title} url={url} />
    </div>
  )
}

/**
 * Placeholder shown while a freshly added bookmark waits for its first
 * metadata fetch.
 */
function SavingPlaceholderCard({ url }: any) {
  const domain = getDomain(url)
  return (
    <div className="bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 shadow-[0_1px_3px_rgba(40,30,25,0.08)]">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center px-6">
        <p className="text-gray-400 text-[13px] text-center leading-snug">
          One moment.<br />
          Polishing this gem.
        </p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-400">{domain}</p>
      </div>
    </div>
  )
}

function ArticleCard({ imageUrl, title, faviconUrl, url }: any) {
  const [imgError, setImgError] = useState(false)
  const [iconError, setIconError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  if (!imageUrl || imgError) {
    return <GemFallbackCard title={title} url={url} cardType="article" />
  }

  return (
    <div className="bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 hover:border-[#26221c]/60 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-all">
      <div className="relative aspect-[16/10] bg-gray-50 overflow-hidden">
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      </div>
      <div className="px-4 pt-3 pb-3">
        <h3 className="font-serif font-medium text-[16px] leading-[1.25] text-ink line-clamp-3 tracking-tight">
          {cleanTitle}
        </h3>
        <div className="flex items-center gap-1.5 mt-2">
          {faviconUrl && !iconError ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-3.5 h-3.5 rounded-sm"
              onError={() => setIconError(true)}
            />
          ) : (
            <div className="w-3.5 h-3.5 rounded-sm bg-gray-200" />
          )}
          <span className="text-[10px] uppercase tracking-[0.13em] text-stone-500 font-serif truncate">{domain}</span>
        </div>
      </div>
    </div>
  )
}

function BookCard({ imageUrl, title, author, url }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)

  if (!imageUrl || imgError) {
    return <GemFallbackCard title={title} url={url} cardType="book" />
  }

  return (
    <div className="bg-white rounded-none overflow-hidden flex flex-col h-full border border-[#26221c]/30 hover:border-[#26221c]/60 shadow-[0_1px_3px_rgba(40,30,25,0.08)] transition-all">
      <div className="relative aspect-[2/3] bg-gradient-to-br from-gray-50 via-white to-gray-50 overflow-hidden flex items-center justify-center p-8">
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="max-w-full max-h-full object-contain shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          onError={() => setImgError(true)}
        />
      </div>
      <div className="px-4 py-3 text-center">
        <h3 className="font-serif text-[15px] text-ink font-medium line-clamp-2 tracking-tight leading-snug">
          {cleanTitle}
        </h3>
        {author && (
          <p className="text-[11px] text-gray-500 mt-1 italic">{author}</p>
        )}
      </div>
    </div>
  )
}

function ProfileCard({ title, faviconUrl, url }: any) {
  const [imgError, setImgError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const colors = getBrandColors(domain)

  return (
    <div className={CARD_FRAME}>
      <div className={`relative w-full aspect-[4/3] overflow-hidden ${colors.bg} flex items-center justify-center p-6`}>
        {faviconUrl && !imgError ? (
          <img
            src={faviconUrl}
            alt=""
            className="w-16 h-16 rounded-full"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
            {domain.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
      <CardFooter title={title} url={url} />
    </div>
  )
}

function DefaultCard({ imageUrl, screenshotUrl, url, title, faviconUrl }: any) {
  const displayImage = screenshotUrl || imageUrl

  if (!displayImage) {
    return <SavingPlaceholderCard url={url} />
  }

  return (
    <ArticleCard
      imageUrl={displayImage}
      title={title}
      faviconUrl={faviconUrl}
      url={url}
    />
  )
}

export function BookmarkCard({
  id, title, description, url, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  tags, allTags = [], note, isOwner, onDelete, onTagsUpdate, onNoteUpdate, cardType,
}: BookmarkCardProps) {
  const product = cardType === 'product' && rawMetadata ? pickProduct(rawMetadata) : null
  const book = cardType === 'book' && rawMetadata ? pickBook(rawMetadata) : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState<string>(note || '')
  const [tagInput, setTagInput] = useState('')
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const [localNote, setLocalNote] = useState<string | null>(note ?? null)
  const [suggestIndex, setSuggestIndex] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null)

  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  const embed = detectEmbed(url)

  useEffect(() => {
    if (!menuOpen && !editingTags && !editingNote) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        if (editingTags) {
          setEditingTags(false)
          onTagsUpdate?.(id, localTags)
        }
        if (editingNote) {
          saveNote()
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, editingTags, editingNote, localTags, noteDraft, id, onTagsUpdate])

  useEffect(() => {
    if (editingTags && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [editingTags])

  useEffect(() => {
    if (editingNote && noteTextareaRef.current) {
      noteTextareaRef.current.focus()
      noteTextareaRef.current.setSelectionRange(noteDraft.length, noteDraft.length)
    }
  }, [editingNote])

  useEffect(() => {
    setLocalNote(note ?? null)
    setNoteDraft(note || '')
  }, [note])

  const saveNote = () => {
    const cleaned = noteDraft.trim()
    const next = cleaned.length > 0 ? cleaned : null
    setLocalNote(next)
    setEditingNote(false)
    onNoteUpdate?.(id, next)
  }

  const suggestions = tagInput
    ? allTags.filter(t => t.toLowerCase().includes(tagInput.toLowerCase()) && !localTags.includes(t))
    : []

  const addTag = (tag: string) => {
    const clean = tag.toLowerCase().trim()
    if (clean && !localTags.includes(clean)) {
      setLocalTags([...localTags, clean])
    }
    setTagInput('')
    setSuggestIndex(-1)
  }

  const removeTag = (tag: string) => {
    setLocalTags(localTags.filter(t => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      if (suggestIndex >= 0 && suggestions[suggestIndex]) {
        addTag(suggestions[suggestIndex])
      } else if (tagInput.trim()) {
        addTag(tagInput)
      }
    } else if (e.key === 'Backspace' && !tagInput && localTags.length > 0) {
      removeTag(localTags[localTags.length - 1])
    } else if (e.key === 'Escape') {
      setEditingTags(false)
      onTagsUpdate?.(id, localTags)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSuggestIndex(Math.min(suggestIndex + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSuggestIndex(Math.max(suggestIndex - 1, -1))
    }
  }

  const cardContent = (
    <>
      {cardType === 'composite' && (
        <CompositeCard
          imageUrl={imageUrl}
          title={title}
          faviconUrl={faviconUrl}
          url={url}
        />
      )}
      {cardType === 'fullbleed' && (
        <FullbleedCard imageUrl={imageUrl} title={title} url={url} />
      )}
      {cardType === 'screenshot' && (
        <ScreenshotCard imageUrl={screenshotUrl || imageUrl} title={title} url={url} />
      )}
      {cardType === 'profile' && (
        <ProfileCard title={title} faviconUrl={faviconUrl} url={url} />
      )}
      {cardType === 'product' && (
        <ProductCard
          imageUrl={imageUrl}
          title={title}
          url={url}
          priceFormatted={product?.priceFormatted || null}
        />
      )}
      {cardType === 'article' && (
        <ArticleCard
          imageUrl={imageUrl}
          title={title}
          faviconUrl={faviconUrl}
          url={url}
        />
      )}
      {cardType === 'book' && (
        <BookCard
          imageUrl={imageUrl || book?.image}
          title={title || book?.title}
          author={book?.author}
          url={url}
        />
      )}
      {cardType === 'lth' && (
        <GemFallbackCard title={title} url={url} cardType={cardType} />
      )}
      {!cardType && (
        <DefaultCard
          imageUrl={imageUrl}
          screenshotUrl={screenshotUrl}
          url={url}
          title={title}
          faviconUrl={faviconUrl}
        />
      )}
    </>
  )

  return (
    <div className="relative group">
      {embed ? (
        <RichEmbedCard info={embed} title={title} url={url} />
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {cardContent}
        </a>
      )}

      {localNote && (
        <p className="mt-2 px-1 text-sm text-gray-600 italic leading-snug whitespace-pre-wrap">
          {localNote}
        </p>
      )}

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

          {menuOpen && !editingTags && !editingNote && (
            <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[150px] z-50">
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setEditingNote(true)
                  setMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {localNote ? 'edit note' : 'add note'}
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setEditingTags(true)
                  setMenuOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              >
                edit tags
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

          {editingNote && (
            <div
              className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-[260px] z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <label className="block text-[11px] uppercase tracking-wider text-gray-400 mb-1.5">
                curator note
              </label>
              <textarea
                ref={noteTextareaRef}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setEditingNote(false)
                    setNoteDraft(localNote || '')
                  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    saveNote()
                  }
                }}
                placeholder="why this one's a gem..."
                rows={3}
                maxLength={280}
                className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-[10px] text-gray-400">{noteDraft.length}/280</span>
                <div className="flex gap-1">
                  {localNote && (
                    <button
                      onClick={() => {
                        setNoteDraft('')
                        setLocalNote(null)
                        setEditingNote(false)
                        onNoteUpdate?.(id, null)
                      }}
                      className="px-2 py-1 text-[11px] text-gray-500 hover:text-red-600"
                    >
                      clear
                    </button>
                  )}
                  <button
                    onClick={saveNote}
                    className="px-3 py-1 bg-gray-900 text-white rounded text-[11px] font-medium hover:bg-gray-800"
                  >
                    save
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingTags && (
            <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[220px] z-50" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-wrap gap-1 mb-2">
                {localTags.map(tag => (
                  <span key={tag} className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-600">&times;</button>
                  </span>
                ))}
              </div>
              <div className="relative">
                <input
                  ref={tagInputRef}
                  type="text"
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setSuggestIndex(-1) }}
                  onKeyDown={handleTagKeyDown}
                  placeholder="add tag..."
                  className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
                {suggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-32 overflow-y-auto z-50">
                    {suggestions.map((s, i) => (
                      <button
                        key={s}
                        onClick={() => addTag(s)}
                        className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${i === suggestIndex ? 'bg-gray-100 text-gray-900' : 'text-gray-600 hover:bg-gray-50'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
