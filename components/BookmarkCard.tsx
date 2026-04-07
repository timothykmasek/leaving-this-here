'use client'

import { useState, useRef, useEffect } from 'react'
import { pickProduct, pickBook } from '@/lib/metadata'

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
  isOwner: boolean
  isPrivate: boolean
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

function CompositeCard({ imageUrl, title, faviconUrl, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const [heroError, setHeroError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      {/* Favicon + domain pill */}
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
        <span className="text-[11px] text-gray-500 font-medium truncate tracking-tight">{domain}</span>
      </div>

      {/* Title */}
      <div className="px-4 pb-3">
        <h3 className="font-semibold text-[15px] leading-[1.3] text-gray-900 line-clamp-3 tracking-tight">
          {cleanTitle}
        </h3>
      </div>

      {/* Image hero */}
      {imageUrl && !heroError && (
        <div className="relative aspect-[16/10] bg-gray-50 overflow-hidden mx-3 mb-3 rounded-lg">
          <img
            src={imageUrl}
            alt={cleanTitle}
            className="w-full h-full object-cover"
            onError={() => setHeroError(true)}
          />
        </div>
      )}

      {isPrivate && (
        <div className="absolute top-2 left-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
          private
        </div>
      )}
    </div>
  )
}

function FullbleedCard({ imageUrl, title, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="relative w-full aspect-[4/3] overflow-hidden bg-white rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all group">
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-contain"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-400">
          <span className="text-xs">no image</span>
        </div>
      )}

      {isPrivate && (
        <div className="absolute top-2 left-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
          private
        </div>
      )}
    </div>
  )
}

function ScreenshotCard({ imageUrl, title, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const gradient = getGradient(url)

  return (
    <div className={`relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all group bg-gradient-to-br ${gradient}`}>
      {imageUrl && !imgError ? (
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-xs text-gray-400">loading...</span>
        </div>
      )}

      {isPrivate && (
        <div className="absolute top-2 left-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
          private
        </div>
      )}
    </div>
  )
}

function ProductCard({ imageUrl, title, url, isPrivate, priceFormatted }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      {/* Product image — clean background, product-shot crop */}
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

        {/* Price chip, top-right */}
        {priceFormatted && (
          <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-sm border border-gray-150 text-gray-900 text-[12px] font-semibold px-2.5 py-1 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {priceFormatted}
          </div>
        )}

        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>

      {/* Title only — no domain row, like mymind */}
      <div className="px-4 py-3 text-center">
        <h3 className="text-[13px] text-gray-900 line-clamp-2 tracking-tight">
          {cleanTitle}
        </h3>
      </div>
    </div>
  )
}

/**
 * LTH fallback — soft grey gradient with the "LTH" mark in the middle.
 * Used whenever we have no usable image (paywall, logo-only OG, fetch fail).
 * Also exported as a primitive that other cards swap to on <img> error.
 */
function LTHFallbackCard({ title, url, isPrivate }: any) {
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 flex items-center justify-center">
        <span className="text-gray-300 text-2xl font-light tracking-[0.3em] select-none">LTH</span>
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <h3 className="font-medium text-gray-900 line-clamp-2 text-[14px] leading-snug tracking-tight">
          {cleanTitle}
        </h3>
        <p className="text-[11px] text-gray-400 mt-1">{domain}</p>
      </div>
    </div>
  )
}

/**
 * "One moment. I'm saving this for you." — placeholder shown while a freshly
 * added bookmark waits for its first metadata fetch. No spinner, just a quiet
 * static message.
 */
function SavingPlaceholderCard({ url, isPrivate }: any) {
  const domain = getDomain(url)
  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150">
      <div className="relative aspect-[4/3] bg-gradient-to-br from-gray-50 via-white to-gray-50 flex items-center justify-center px-6">
        <p className="text-gray-400 text-[13px] text-center leading-snug">
          One moment.<br />
          I&rsquo;m saving this for you.
        </p>
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-400">{domain}</p>
      </div>
    </div>
  )
}

/**
 * Article card — image on top, title + favicon row below. The standard
 * editorial layout. Replaces the old "composite for articles" pattern.
 */
function ArticleCard({ imageUrl, title, faviconUrl, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const [iconError, setIconError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  // If image fails or never existed, fall back to LTH so the grid stays clean.
  if (!imageUrl || imgError) {
    return <LTHFallbackCard title={title} url={url} isPrivate={isPrivate} />
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative aspect-[16/10] bg-gray-50 overflow-hidden">
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <div className="px-4 pt-3 pb-3">
        <h3 className="font-semibold text-[15px] leading-[1.3] text-gray-900 line-clamp-3 tracking-tight">
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
          <span className="text-[11px] text-gray-500 font-medium truncate tracking-tight">{domain}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Book card — portrait cover, title and author below. Mirrors the product
 * card pattern but with a 2:3 cover crop and no price chip.
 */
function BookCard({ imageUrl, title, author, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const cleanTitle = getCleanTitle(title, url)

  if (!imageUrl || imgError) {
    return <LTHFallbackCard title={title} url={url} isPrivate={isPrivate} />
  }

  return (
    <div className="bg-white rounded-xl overflow-hidden flex flex-col h-full border border-gray-150 hover:border-gray-300 hover:shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all">
      <div className="relative aspect-[2/3] bg-gradient-to-br from-gray-50 via-white to-gray-50 overflow-hidden flex items-center justify-center p-8">
        <img
          src={imageUrl}
          alt={cleanTitle}
          className="max-w-full max-h-full object-contain shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          onError={() => setImgError(true)}
        />
        {isPrivate && (
          <div className="absolute top-3 left-3 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
            private
          </div>
        )}
      </div>
      <div className="px-4 py-3 text-center">
        <h3 className="text-[14px] text-gray-900 font-semibold line-clamp-2 tracking-tight leading-snug">
          {cleanTitle}
        </h3>
        {author && (
          <p className="text-[11px] text-gray-500 mt-1 italic">{author}</p>
        )}
      </div>
    </div>
  )
}

function ProfileCard({ title, faviconUrl, url, isPrivate }: any) {
  const [imgError, setImgError] = useState(false)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const colors = getBrandColors(domain)

  return (
    <div className={`relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all ${colors.bg} flex flex-col items-center justify-center p-6 gap-3`}>
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
      <p className={`text-center text-sm font-semibold line-clamp-2 ${colors.text}`}>
        {cleanTitle}
      </p>

      {isPrivate && (
        <div className="absolute top-2 left-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
          private
        </div>
      )}
    </div>
  )
}

/**
 * DefaultCard — used when a bookmark has no card_type yet (very fresh).
 * No more thum.io: if there's no usable image we show the
 * "saving this for you" placeholder, then the LTH fallback if metadata
 * lands without an image.
 */
function DefaultCard({ imageUrl, screenshotUrl, url, title, faviconUrl, isPrivate }: any) {
  const displayImage = screenshotUrl || imageUrl

  // No image at all → "saving this for you" placeholder.
  if (!displayImage) {
    return <SavingPlaceholderCard url={url} isPrivate={isPrivate} />
  }

  // ArticleCard handles its own error state and falls back to LTH internally.
  return (
    <ArticleCard
      imageUrl={displayImage}
      title={title}
      faviconUrl={faviconUrl}
      url={url}
      isPrivate={isPrivate}
    />
  )
}

export function BookmarkCard({
  id, title, description, url, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  tags, allTags = [], isOwner, isPrivate, onDelete, onPrivacyToggle, onTagsUpdate, cardType,
}: BookmarkCardProps) {
  // Derive product / book info from stored raw_metadata (free, no network)
  const product = cardType === 'product' && rawMetadata ? pickProduct(rawMetadata) : null
  const book = cardType === 'book' && rawMetadata ? pickBook(rawMetadata) : null
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingTags, setEditingTags] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [localTags, setLocalTags] = useState<string[]>(tags)
  const [suggestIndex, setSuggestIndex] = useState(-1)
  const menuRef = useRef<HTMLDivElement>(null)
  const tagInputRef = useRef<HTMLInputElement>(null)

  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen && !editingTags) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        if (editingTags) {
          setEditingTags(false)
          onTagsUpdate?.(id, localTags)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, editingTags, localTags, id, onTagsUpdate])

  // Focus tag input when opening
  useEffect(() => {
    if (editingTags && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [editingTags])

  // Tag suggestions
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

  // Render card based on type
  const cardContent = (
    <>
      {cardType === 'composite' && (
        <CompositeCard
          imageUrl={imageUrl}
          title={title}
          faviconUrl={faviconUrl}
          url={url}
          isPrivate={isPrivate}
        />
      )}
      {cardType === 'fullbleed' && (
        <FullbleedCard imageUrl={imageUrl} title={title} url={url} isPrivate={isPrivate} />
      )}
      {cardType === 'screenshot' && (
        <ScreenshotCard imageUrl={screenshotUrl || imageUrl} title={title} url={url} isPrivate={isPrivate} />
      )}
      {cardType === 'profile' && (
        <ProfileCard title={title} faviconUrl={faviconUrl} url={url} isPrivate={isPrivate} />
      )}
      {cardType === 'product' && (
        <ProductCard
          imageUrl={imageUrl}
          title={title}
          url={url}
          isPrivate={isPrivate}
          priceFormatted={product?.priceFormatted || null}
        />
      )}
      {cardType === 'article' && (
        <ArticleCard
          imageUrl={imageUrl}
          title={title}
          faviconUrl={faviconUrl}
          url={url}
          isPrivate={isPrivate}
        />
      )}
      {cardType === 'book' && (
        <BookCard
          imageUrl={imageUrl || book?.image}
          title={title || book?.title}
          author={book?.author}
          url={url}
          isPrivate={isPrivate}
        />
      )}
      {cardType === 'lth' && (
        <LTHFallbackCard title={title} url={url} isPrivate={isPrivate} />
      )}
      {!cardType && (
        <DefaultCard
          imageUrl={imageUrl}
          screenshotUrl={screenshotUrl}
          url={url}
          title={title}
          faviconUrl={faviconUrl}
          isPrivate={isPrivate}
        />
      )}
    </>
  )

  return (
    <div className="relative">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {cardContent}
      </a>

      {/* Info section — skipped for cards that render their own title row */}
      {cardType &&
        cardType !== 'composite' &&
        cardType !== 'product' &&
        cardType !== 'article' &&
        cardType !== 'book' &&
        cardType !== 'lth' && (
        <div className="px-3 py-2.5 bg-white border-t border-gray-100 rounded-b-xl">
          <h3 className="font-medium text-gray-900 line-clamp-1 text-sm leading-snug">
            {cleanTitle}
          </h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{domain}</p>
        </div>
      )}

      {/* Owner menu — subtle "..." button in top right */}
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

          {menuOpen && !editingTags && (
            <div className="absolute right-0 top-9 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[140px] z-50">
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

          {/* Tag editor */}
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
