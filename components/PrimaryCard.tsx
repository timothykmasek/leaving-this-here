'use client'

import { memo, useEffect, useState } from 'react'
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
//   label  → category text overlaid top-left, colour adapts to the image
//   caption→ below the plate: a ONE-LINE title (Mier), and — only if the bullet
//            is in a list — a second Cardo line naming that list (tick + name).
//            No list → no second line → the card is shorter.
// Reuses the CardThumb fallback chain (og → screenshot → favicon plate).

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

// Per-type affordance overlay — the visual cue that says what KIND of thing this
// is beyond the label. `play` (Video) is the big centred one; `disc`/`mic`
// (Music/Podcast) are small corner badges; `favicon` (Article) tucks the source
// mark bottom-left. `price`/`avatar` need data we don't reliably have yet, so
// they render nothing for now.
function Affordance({ kind, faviconUrl }: { kind: Affordance; faviconUrl?: string | null }) {
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
  if (kind === 'favicon' && faviconUrl) {
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

// Adaptive label colour. The label sits top-left over the image; pick dark ink
// on a light corner, white on a dark one, so it never disappears. Sample the
// top-left region via a probe <img> with crossOrigin — works when the host
// sends CORS (Supabase screenshots do); on a tainted/failed probe keep the
// white default (+ shadow). Prod follow-up: compute once server-side at save.
function useAdaptiveLabelDark(src: string | undefined): boolean {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (!src) { setDark(false); return }
    let cancelled = false
    const probe = new Image()
    probe.crossOrigin = 'anonymous'
    probe.onload = () => {
      if (cancelled) return
      try {
        const c = document.createElement('canvas')
        c.width = 20; c.height = 20
        const ctx = c.getContext('2d')
        if (!ctx) return
        // Sample the image's top-left ~35%×25% (where the label sits).
        ctx.drawImage(probe, 0, 0, probe.naturalWidth * 0.35, probe.naturalHeight * 0.25, 0, 0, 20, 20)
        const { data } = ctx.getImageData(0, 0, 20, 20)
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        }
        const lum = sum / (data.length / 4) / 255
        if (!cancelled) setDark(lum > 0.6)
      } catch { /* tainted (no CORS) — keep the white default */ }
    }
    probe.src = src
    return () => { cancelled = true }
  }, [src])
  return dark
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
  category?: string
  categoryColor?: string
  showLabel?: boolean
  // Owner view: clicking opens the bullet-detail modal instead of navigating to
  // the URL (mirrors BookmarkCard). Requires `id`.
  onOpen?: (id: string) => void
}

export const PrimaryCard = memo(function PrimaryCard({
  id, url, title, description, imageUrl, screenshotUrl, faviconUrl, rawMetadata,
  cardType, imagePref, listName, category, categoryColor, showLabel = true, onOpen,
}: PrimaryCardProps) {
  const domain = getDomain(url)
  const fmt = resolveCategory(url, cardType)
  const cleanTitle = formatCardTitle({
    title, description, url, siteName: rawMetadata?.og?.site_name ?? null,
  })
  const candidates = cardImageCandidates(url, imageUrl, screenshotUrl, cardType, imagePref)
  const label = category ?? fmt.label
  const labelDark = useAdaptiveLabelDark(candidates[0])
  const labelColor = categoryColor ?? (labelDark ? '#2b2b2b' : '#ffffff')

  const body = (
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
        <Affordance kind={fmt.affordance} faviconUrl={faviconUrl} />

        {/* Category label — Mier A Black 14px, top-left; colour adapts to the
            corner, shadow only on the white variant to lift it off imagery. */}
        {showLabel && (
          <span
            className="absolute left-5 top-[18px] font-sans text-[14px] font-[900] leading-none"
            style={{
              color: labelColor,
              textShadow: labelDark ? 'none' : '0 1px 3px rgba(0,0,0,0.35)',
            }}
          >
            {label}
          </span>
        )}
      </div>

      {/* Caption. Title: Mier A Book 14px, ONE line, ellipsis. */}
      {cleanTitle && (
        <p className="mt-3 truncate font-sans text-[14px] font-[400] leading-5 tracking-[0.03em] text-ink">
          {cleanTitle}
        </p>
      )}
      {/* List line — Cardo 14px with a thin vertical tick; only if in a list. */}
      {listName && (
        <p className="mt-1.5 flex items-center gap-[7px] font-serif text-[14px] leading-[18px] tracking-[-0.01em] text-ink/55">
          <span aria-hidden className="inline-block h-[10px] w-[1.5px] shrink-0 bg-ink/30" />
          <span className="truncate">{listName}</span>
        </p>
      )}
    </>
  )

  // Owner view opens the detail modal; everyone else navigates to the URL.
  return onOpen && id ? (
    <button type="button" onClick={() => onOpen(id)} className="group block w-full text-left">
      {body}
    </button>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group block w-full">
      {body}
    </a>
  )
})
