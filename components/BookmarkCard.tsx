'use client'

import { useState } from 'react'
import Image from 'next/image'
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
  // When set (owner view), clicking the card opens the bullet detail modal
  // instead of navigating to the original URL.
  onOpen?: (id: string) => void
  // Lists this bullet belongs to / the owner's handle. Still accepted from the
  // callers but no longer rendered — the card used to show the first list as a
  // bottom tag; we dropped it so the card stays about the bullet itself.
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

// Corner rivet (the bulletin-board "pin" dots) — ~8px, inset ~7.4%.
function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[7px] w-[7px] rounded-full bg-[#d9d9d9] ${className}`} />
}

// Bulletin "Link card" — uniform 272×270 plate: #f1f1f1 panel w/ corner rivets,
// inset rounded thumbnail, Cardo-bold title. Spec: Figma node 695:840.
//
// Uses a stretched-link pattern: the whole card is one click target (the
// original URL), with the owner's edit button layered above it — so no
// <a>-in-<a> / button-in-<a> nesting.
export function BookmarkCard({
  id, title, url, imageUrl, screenshotUrl, cardType, isOwner, onOpen,
}: BookmarkCardProps) {
  const [imgError, setImgError] = useState(false)

  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const image = pickCardImage(url, imageUrl, screenshotUrl, cardType)
  const hasImage = !!image && !imgError

  return (
    <div className="group relative aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]">
      {/* corner rivets */}
      <Rivet className="left-[7.4%] top-[7.4%]" />
      <Rivet className="right-[7.4%] top-[7.4%]" />
      <Rivet className="bottom-[7.4%] left-[7.4%]" />
      <Rivet className="bottom-[7.4%] right-[7.4%]" />

      {/* thumbnail — 67.6% wide, 184:118, at (16.2%, 21.9%); domain fallback */}
      <div className="absolute left-[16.2%] top-[21.9%] aspect-[184/118] w-[67.6%] overflow-hidden rounded-[10px] bg-black/[0.06]">
        {hasImage ? (
          // next/image: optimizer resizes the source down to thumbnail width and
          // lazy-loads off-screen cards. `fill` works because the wrapper above is
          // positioned. onError falls back to the domain plate.
          <Image
            src={image!}
            alt=""
            fill
            sizes="(min-width: 1024px) 184px, 25vw"
            className="object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-3">
            <span className="label text-center text-black/30">{domain}</span>
          </div>
        )}
      </div>

      {/* title — Cardo bold 12px, left-aligned, 2 lines */}
      <h3 className="absolute left-[16.2%] top-[69%] line-clamp-2 w-[67.6%] font-serif text-[12px] font-bold leading-[13px] text-ink">
        {cleanTitle}
      </h3>

      {/* stretched click target — always opens the original link */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={cleanTitle}
        className="absolute inset-0 z-[1]"
      />

      {/* Hover affordance to open the detail/edit view — owners click the card to
          reach the original site, so this gives them a direct way into editing. */}
      {isOwner && onOpen && (
        <button
          type="button"
          onClick={() => onOpen(id)}
          aria-label="edit bullet"
          title="edit"
          // Sits over the bottom-right rivet. Desktop only: on hover-capable
          // devices it's hidden until the card is hovered. On touch devices
          // (no hover) it's hidden outright — a pencil pinned to every card read
          // as clutter — so mobile taps just open the link; editing is desktop.
          className="absolute bottom-3 right-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition-opacity hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden"
        >
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
          >
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
      )}
    </div>
  )
}
