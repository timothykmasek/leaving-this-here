'use client'

import { memo } from 'react'
import { cardImageCandidates } from '@/lib/cardImage'
import { CardThumb } from '@/components/CardThumb'
import { FaviconPlate } from '@/components/FaviconPlate'
import { formatCardTitle } from '@/lib/cardTitle'
import { resolveCategory, type Affordance } from '@/lib/cardFormat'
import type { CardType } from '@/lib/cardType'

// ── Bulletin DS "Primary Card" (Figma symbol 886:3378) ──────────────────────
// The redesign's saved-page card, one flexible primitive:
//   plate  → the image at its NATURAL aspect, clipped by a rounded rect. No
//            forced crop, no white letterbox — each card is the shape of its
//            image, so the feed reads as a true masonry.
//   overlay→ a small per-type affordance (play / disc / mic / source favicon)
//   caption→ below the plate: a ONE-LINE title (Mier), and — only if the bullet
//            is in a list — a second Cardo line naming that list (tick + name).
//            No list → no second line → the card is shorter.
// Reuses the CardThumb fallback chain (og → screenshot → favicon plate). No
// category label overlay — categories live off-card (removed 2026-08-15).

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Per-type affordance overlay — the visual cue for what KIND of thing this is.
// `play` (Video) is the big centred one; `disc`/`mic` (Music/Podcast) are small
// corner badges; `favicon` (Article) tucks the source mark bottom-left — but only
// over real imagery (`hasImage`), since an imageless card already shows the
// favicon centred in its FaviconPlate. `price`/`avatar` need data we don't have
// yet, so they render nothing for now.
function AffordanceOverlay({ kind, faviconUrl, hasImage }: { kind: Affordance; faviconUrl?: string | null; hasImage: boolean }) {
  if (kind === 'play') {
    return (
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-black/45 backdrop-blur-[2px] ring-1 ring-white/25">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        </span>
      </span>
    )
  }
  if (kind === 'disc' || kind === 'mic') {
    return (
      <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/45 backdrop-blur-[2px] ring-1 ring-white/25">
        {kind === 'disc' ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" aria-hidden><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="1.6" fill="#fff" /></svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" aria-hidden><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11a6 6 0 0 0 12 0M12 17v4" /></svg>
        )}
      </span>
    )
  }
  if (kind === 'favicon' && faviconUrl && hasImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={faviconUrl}
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 rounded-[6px] bg-white/90 p-[3px] shadow-[0_1px_4px_rgba(0,0,0,0.25)]"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
      />
    )
  }
  return null
}

interface PrimaryCardProps {
  id?: string
  url: string
  title: string | null
  description?: string | null
  imageUrl: string | null
  screenshotUrl: string | null
  faviconUrl?: string | null
  rawMetadata?: any
  cardType?: CardType | null
  imagePref?: string | null
  // The list this bullet belongs to (if any). Present → the second caption line
  // renders and the card is taller; absent → no line, shorter card.
  listName?: string | null
  // The list's public page — makes the list line a link. Null → plain text.
  listHref?: string | null
  // Owner view: adds a hover pencil that opens the bullet-detail modal. The card
  // itself always goes to the link (mirrors BookmarkCard). Requires `id`.
  onOpen?: (id: string) => void
}

export const PrimaryCard = memo(function PrimaryCard({
  id, url, title, description, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  cardType, imagePref, listName, listHref, onOpen,
}: PrimaryCardProps) {
  const domain = getDomain(url)
  const fmt = resolveCategory(url, cardType)
  const cleanTitle = formatCardTitle({
    title, description, url, siteName: rawMetadata?.og?.site_name ?? null,
  })
  const candidates = cardImageCandidates(url, imageUrl, screenshotUrl, cardType, imagePref)

  // The clickable card (plate + title). The list line lives OUTSIDE this so it
  // can be its own link (no <a> nested in an <a>).
  const card = (
    <>
      {/* The plate — the image at natural aspect, rounded + clipped. */}
      <div className="relative w-full overflow-hidden rounded-[20px] bg-card shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.12)]">
        <CardThumb
          candidates={candidates}
          className="block w-full h-auto"
          // No image → the favicon plate, given the type's fallback shape.
          fallback={
            <div className="w-full" style={{ aspectRatio: fmt.aspect }}>
              <FaviconPlate faviconUrl={faviconUrl} domain={domain} />
            </div>
          }
        />

        {/* Soft foot-fade to paper — matches the DS plate. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-b from-transparent to-paper/70"
        />

        {/* Per-type affordance (play / disc / mic / source favicon). */}
        <AffordanceOverlay kind={fmt.affordance} faviconUrl={faviconUrl} hasImage={candidates.length > 0} />
      </div>

      {/* Title — Mier A Book 14px, one line. Overflow FADES to transparent at the
          right edge (mask gradient) rather than a hard "…" ellipsis. */}
      {cleanTitle && (
        <p className="mt-3 overflow-hidden whitespace-nowrap font-sans text-[14px] font-[400] leading-5 tracking-[0.03em] text-ink [-webkit-mask-image:linear-gradient(to_right,#000_88%,transparent)] [mask-image:linear-gradient(to_right,#000_88%,transparent)]">
          {cleanTitle}
        </p>
      )}
    </>
  )

  return (
    <div className="w-full">
      {/* The card always goes to the original link — owner or not. Owners get the
          detail/edit view from the hover pencil below (a button can't nest inside
          the anchor, so it's an absolutely-positioned sibling). */}
      <div className="group relative w-full">
        <a href={url} target="_blank" rel="noopener noreferrer" className="block w-full">
          {card}
        </a>

        {onOpen && id && (
          <button
            type="button"
            onClick={() => onOpen(id)}
            aria-label="edit bullet"
            title="edit"
            // Top-right of the plate — bottom corners belong to the disc/mic
            // affordances. Desktop only: revealed on hover, hidden outright on
            // touch (a pencil pinned to every card reads as clutter), so mobile
            // taps just open the link.
            className="absolute right-3 top-3 z-[2] flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-stone-600 shadow-sm backdrop-blur-sm transition-opacity hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:none)]:hidden"
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

      {/* List line — Cardo 14px with a three-dot (⋮) tick; links to the list's
          page when it has one. Only rendered when the bullet is in a list. */}
      {listName && (() => {
        const inner = (
          <>
            <span aria-hidden className="flex shrink-0 flex-col items-center justify-center gap-[2px] opacity-60">
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
              <span className="h-[2px] w-[2px] rounded-full bg-current" />
            </span>
            <span className="truncate">{listName}</span>
          </>
        )
        const cls = 'mt-1.5 flex items-center gap-[7px] font-serif text-[14px] leading-[18px] tracking-[-0.01em] text-ink/55'
        return listHref ? (
          <a href={listHref} className={`${cls} transition-colors hover:text-ink`}>{inner}</a>
        ) : (
          <p className={cls}>{inner}</p>
        )
      })()}
    </div>
  )
})
