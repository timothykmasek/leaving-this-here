'use client'

// The card for a link with no usable picture.
//
// This replaces a plate that showed the site's favicon over its domain in grey
// caps — which was wrong twice over. It threw away everything the card already
// knew (the title, the description, the type), and the one thing it did show,
// the brand, is ALREADY printed directly underneath the card as the title line.
// So a failed capture produced a grey box repeating the caption below it.
//
// There will always be links with no picture: sites that serve no og:image,
// sites that refuse a capture, sites that are gone. About a quarter of the
// seeded library is in that state. So this is not an error state to be
// tolerated — it is a card format, and it should be able to sit next to a
// photograph without looking like something failed.
//
// What it shows, in order of what is actually worth reading:
//
//   the description  — what the thing IS, in the editorial serif. The most
//                      useful sentence we hold, and on a photo card it never
//                      gets shown at all.
//   the brand        — set large when there is no description, so the card
//                      becomes a deliberate wordmark rather than an apology.
//   the domain       — small, at the foot, in the label voice: the quiet
//                      source line a printed page would carry.
//
// The favicon rides at the top as a masthead mark, small enough to read as
// provenance rather than as the subject.

import { useState } from 'react'

export function CardFallback({
  domain,
  faviconUrl,
  brand,
  description,
}: {
  domain: string
  faviconUrl?: string | null
  /** The site's name, already cleaned by lib/cardTitle. */
  brand: string
  description?: string | null
}) {
  const [faviconBroken, setFaviconBroken] = useState(false)
  const text = (description || '').trim()
  // Long enough to be a sentence, not a stray fragment or a cookie notice.
  const hasProse = text.length >= 24

  return (
    <div className="flex h-full w-full flex-col justify-between p-5">
      <div className="flex items-center gap-2">
        {faviconUrl && !faviconBroken ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={faviconUrl}
            alt=""
            className="h-4 w-4 shrink-0 rounded-[3px] opacity-80"
            onError={() => setFaviconBroken(true)}
          />
        ) : (
          // A mark either way, so the top line never collapses and cards with
          // and without a favicon still align with each other in a grid.
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-black/25" />
        )}
      </div>

      {hasProse ? (
        <p
          className="font-serif text-[15px] leading-[22px] tracking-[-0.01em] text-black/70"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 5,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {text}
        </p>
      ) : (
        // Nothing to say about it → say its name properly. Mier DemiBold, the
        // face both page headlines use, at a size that reads as a decision.
        <p
          className="font-sans text-[26px] font-[600] leading-[30px] tracking-[-0.01em] text-black/70"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {brand}
        </p>
      )}

      <span className="label truncate text-black/30">{domain}</span>
    </div>
  )
}
