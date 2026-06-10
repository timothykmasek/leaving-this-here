'use client'

import { useState } from 'react'
import Link from 'next/link'
import { pickProduct, pickBook } from '@/lib/metadata'
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
  // When set (owner view), clicking the card opens the gem detail modal
  // instead of navigating to the original URL.
  onOpen?: (id: string) => void
  // Lists this gem belongs to. Rendered as a clickable chip (first list + "+N")
  // linking to the published list page at /<ownerUsername>/<slug>.
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

// Uniform fixed-height rounded card. Every gem renders in the same footprint so
// the grid reads as an even, calm wall of cards. Image-led when we have a
// usable image; text-led (domain · title · excerpt) when we don't.
const CARD_HEIGHT = 'h-[260px] sm:h-[300px]'

function Favicon({ faviconUrl, domain }: { faviconUrl: string | null; domain: string }) {
  const [err, setErr] = useState(false)
  if (faviconUrl && !err) {
    return (
      <img
        src={faviconUrl}
        alt=""
        className="h-3.5 w-3.5 rounded-sm"
        onError={() => setErr(true)}
      />
    )
  }
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-stone-200 text-[8px] font-medium text-stone-500">
      {domain.charAt(0).toUpperCase()}
    </span>
  )
}

export function BookmarkCard({
  id, title, description, url, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  note, isOwner, onOpen, cardType, inLists, ownerUsername,
}: BookmarkCardProps) {
  const product = cardType === 'product' && rawMetadata ? pickProduct(rawMetadata) : null
  const book = cardType === 'book' && rawMetadata ? pickBook(rawMetadata) : null
  const [imgError, setImgError] = useState(false)

  const domain = getDomain(url)
  const cleanTitle = getCleanTitle(title, url)
  const image = imageUrl || screenshotUrl || product?.image || book?.image || null
  const hasImage = !!image && !imgError

  // List membership chip — first list links to its public page; extra lists
  // collapse into a non-clickable "+N". stopPropagation keeps a chip click from
  // opening the card (owner detail modal) or the original URL.
  const lists = inLists || []
  const first = lists[0]
  const chips = first ? (
    <div className="mt-2 flex items-center gap-1">
      {first.slug && ownerUsername ? (
        <Link
          href={`/${ownerUsername}/${first.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center truncate rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600 transition-colors hover:bg-stone-200 hover:text-ink"
        >
          {first.name}
        </Link>
      ) : (
        <span className="inline-flex max-w-full items-center truncate rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600">
          {first.name}
        </span>
      )}
      {lists.length > 1 && (
        <span className="shrink-0 text-[10px] font-medium text-stone-400">+{lists.length - 1}</span>
      )}
    </div>
  ) : null

  const footer = (
    <div className="shrink-0 px-4 pb-3.5 pt-3">
      <h3 className="line-clamp-2 font-serif text-[15px] font-medium leading-snug tracking-tight text-ink">
        {cleanTitle}
      </h3>
      <div className="mt-1.5 flex items-center gap-1.5">
        <Favicon faviconUrl={faviconUrl} domain={domain} />
        <span className="truncate text-[10px] uppercase tracking-[0.12em] text-stone-500">
          {domain}
        </span>
      </div>
      {chips}
    </div>
  )

  const cardContent = hasImage ? (
    // Image is inset with a white margin (a "mat"), so a subtle white line
    // frames the preview inside the card.
    <div className={`flex ${CARD_HEIGHT} flex-col`}>
      <div className="min-h-0 flex-1 p-1.5 pb-0">
        <div className="h-full overflow-hidden rounded-lg bg-stone-100">
          <img
            src={image!}
            alt={cleanTitle}
            className="h-full w-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      </div>
      {footer}
    </div>
  ) : (
    // Text-led: domain → title → excerpt. Fills the same footprint.
    <div className={`flex ${CARD_HEIGHT} flex-col p-4`}>
      <div className="flex items-center gap-1.5">
        <Favicon faviconUrl={faviconUrl} domain={domain} />
        <span className="truncate text-[10px] uppercase tracking-[0.12em] text-stone-500">
          {domain}
        </span>
      </div>
      <h3 className="mt-2.5 line-clamp-3 font-serif text-[19px] font-medium leading-[1.25] tracking-tight text-ink">
        {cleanTitle}
      </h3>
      {description ? (
        <p className="mt-2 line-clamp-4 text-[13px] leading-relaxed text-stone-500">
          {description}
        </p>
      ) : (
        !chips && (
          <div className="mt-auto flex justify-end">
            <GemGlyph className="h-7 w-7 text-ink/10" />
          </div>
        )
      )}
      {chips && <div className="mt-auto">{chips}</div>}
    </div>
  )

  const frame =
    'block overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(40,30,25,0.10)] ring-1 ring-black/[0.04] transition-shadow hover:shadow-[0_6px_20px_rgba(40,30,25,0.14)]'

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
          {cardContent}
        </div>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className={frame}>
          {cardContent}
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
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 opacity-0 shadow-sm backdrop-blur-sm transition-opacity hover:text-ink group-hover:opacity-100"
        >
          <span aria-hidden className="text-xs">↗</span>
        </a>
      )}
    </div>
  )
}
