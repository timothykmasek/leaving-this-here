'use client'

import { useState } from 'react'
import Link from 'next/link'
import { pickCardImage } from '@/lib/cardImage'

interface BookmarkCardProps {
  id: string
  title: string | null
  description?: string | null
  url: string
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl?: string | null
  rawMetadata?: any
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
  onNoteUpdate?: (id: string, note: string | null) => void
  // When set (owner view), clicking the card opens the gem detail modal
  // instead of navigating to the original URL.
  onOpen?: (id: string) => void
  // Lists this gem belongs to. The first list becomes the card's tag, linking
  // to its published page at /<ownerUsername>/<slug>.
  inLists?: { id: string; name: string; slug: string | null }[]
  ownerUsername?: string
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
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

// Corner rivet (the bulletin-board "pin" dots) — 8px, inset 20px.
function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[8px] w-[8px] rounded-full bg-black/20 ${className}`} />
}

// Bulletin "Link card" — uniform 272×270 plate: #f1f1f1 panel w/ corner rivets,
// inset rounded thumbnail, Cardo-bold title, bracketed list tag. Spec: Figma
// node 695:840.
export function BookmarkCard({
  id, title, url, imageUrl, screenshotUrl, isOwner, onOpen, inLists, ownerUsername,
}: BookmarkCardProps) {
  const [imgError, setImgError] = useState(false)

  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const image = pickCardImage(url, imageUrl, screenshotUrl)
  const hasImage = !!image && !imgError
  const first = (inLists || [])[0]

  const frame =
    'relative block h-[270px] w-[272px] overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]'

  const inner = (
    <>
      {/* corner rivets */}
      <Rivet className="left-[20px] top-[20px]" />
      <Rivet className="right-[20px] top-[20px]" />
      <Rivet className="bottom-[20px] left-[20px]" />
      <Rivet className="bottom-[20px] right-[20px]" />

      {/* thumbnail — 184×118 @ (44,59); domain fallback when no image */}
      <div className="absolute left-[44px] top-[59px] h-[118px] w-[184px] overflow-hidden rounded-[10px] bg-black/[0.06]">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image!}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3">
            <span className="label text-center text-black/30">{domain}</span>
          </div>
        )}
      </div>

      {/* title — Cardo bold 12px, left-aligned, 2 lines */}
      <h3 className="absolute left-[44px] top-[186px] line-clamp-2 w-[184px] font-serif text-[12px] font-bold leading-[13px] text-ink">
        {cleanTitle}
      </h3>

      {/* list tag — bracketed pill, centered, bottom */}
      {first && (
        <div className="absolute bottom-[16px] left-1/2 -translate-x-1/2">
          {first.slug && ownerUsername ? (
            <Link
              href={`/${ownerUsername}/${first.slug}`}
              onClick={(e) => e.stopPropagation()}
              className="label inline-flex items-center gap-[7px] whitespace-nowrap rounded-full bg-black/[0.06] px-[11px] py-[4px] text-ink transition-colors hover:bg-black/[0.10]"
            >
              <span aria-hidden className="text-black/40">[</span>
              {first.name}
              <span aria-hidden className="text-black/40">]</span>
            </Link>
          ) : (
            <span className="label inline-flex items-center gap-[7px] whitespace-nowrap rounded-full bg-black/[0.06] px-[11px] py-[4px] text-ink">
              <span aria-hidden className="text-black/40">[</span>
              {first.name}
              <span aria-hidden className="text-black/40">]</span>
            </span>
          )}
        </div>
      )}
    </>
  )

  return (
    <div className="group relative">
      {onOpen ? (
        <div
          role="button"
          tabIndex={0}
          className={`${frame} cursor-pointer`}
          onClick={() => onOpen(id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onOpen(id)
            }
          }}
        >
          {inner}
        </div>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className={frame}>
          {inner}
        </a>
      )}

      {/* Hover affordance to open the original — owners click the card itself to
          open the detail view, so this gives them a direct way out to the site. */}
      {isOwner && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="open original"
          title="open original"
          className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <span aria-hidden className="text-xs">↗</span>
        </a>
      )}
    </div>
  )
}
