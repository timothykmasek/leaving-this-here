'use client'

import { useState } from 'react'

interface BookmarkCardProps {
  id: string
  title: string | null
  description: string | null
  url: string
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl: string | null
  tags: string[]
  isOwner: boolean
  isPrivate: boolean
  onDelete?: (id: string) => void
  onPrivacyToggle?: (id: string, isPrivate: boolean) => void
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
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

function getCleanTitle(title: string | null, url: string): string {
  const domain = getDomain(url)

  // If title is null, empty, or is basically the URL itself, use the domain
  if (!title) return domain
  const cleaned = title.trim()
  if (!cleaned) return domain

  // If the title is just a URL (starts with http or is the same as the domain)
  if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) return domain

  // If it's a generic "Home" or "Landing" title, use domain instead
  if (['home', 'landing', 'index'].includes(cleaned.toLowerCase())) return domain

  return cleaned
}

export function BookmarkCard({
  id, title, description, url, imageUrl, screenshotUrl, faviconUrl,
  tags, isOwner, isPrivate, onDelete, onPrivacyToggle,
}: BookmarkCardProps) {
  const [hover, setHover] = useState(false)
  const [imgError, setImgError] = useState(false)

  const displayImage = !imgError ? (screenshotUrl || imageUrl) : null
  const gradient = getGradient(url)
  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)

  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      <div
        className="group flex flex-col bg-white border border-gray-100 hover:border-gray-300 transition-all h-[340px] overflow-hidden rounded-lg isolate"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {/* Image */}
        <div className={`relative w-full h-44 overflow-hidden bg-gradient-to-br ${gradient}`}>
          {displayImage ? (
            <img
              src={displayImage}
              alt={cleanTitle}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-3 p-4">
              {faviconUrl && !imgError ? (
                <img
                  src={faviconUrl}
                  alt=""
                  className="w-10 h-10 rounded opacity-60"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              ) : null}
              <span className="text-sm text-gray-400 font-medium">{domain}</span>
            </div>
          )}

          {/* Owner actions */}
          {isOwner && hover && (
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center gap-2">
              <button
                onClick={(e) => { e.preventDefault(); onPrivacyToggle?.(id, !isPrivate) }}
                className="px-3 py-1 bg-white/90 hover:bg-white text-xs font-medium text-gray-900 rounded transition-colors"
              >
                {isPrivate ? '🔒 private' : '🌐 public'}
              </button>
              <button
                onClick={(e) => { e.preventDefault(); onDelete?.(id) }}
                className="px-3 py-1 bg-white/90 hover:bg-white text-xs font-medium text-red-600 rounded transition-colors"
              >
                delete
              </button>
            </div>
          )}

          {isPrivate && (
            <div className="absolute top-2 right-2 bg-black/40 text-white px-2 py-0.5 rounded text-xs">
              private
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col min-h-0">
          <h3 className="font-medium text-gray-900 line-clamp-1 text-sm">
            {cleanTitle}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{domain}</p>

          {description && (
            <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mt-auto pt-2">
              {tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[11px] text-gray-400">{tag}</span>
              ))}
              {tags.length > 3 && (
                <span className="text-[11px] text-gray-300">+{tags.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </a>
  )
}
