'use client'

// A list page's bullet grid, windowed the way the profile's is: the first
// RENDER_PAGE cards mount up front, the rest as you scroll toward the tail.
// Before this the list page mounted every member at once — 169 cards and
// their images for the AI tools list, in one burst — while the profile next
// door already paged. One grid for both the visitor page (a server component,
// so it can't hold the window state itself) and the owner's client view.

import { useState } from 'react'
import { Masonry } from '@/components/Masonry'
import { PrimaryCard } from '@/components/PrimaryCard'
import { LoadMoreSentinel, RENDER_PAGE } from '@/components/LoadMoreSentinel'

export function ListGrid({
  bullets,
  username,
  // The owner's grid opens the detail sheet, marks private bullets and
  // carries outbound overrides — none of which a visitor's has.
  owner = false,
  onOpen,
}: {
  bullets: any[]
  username: string
  owner?: boolean
  onOpen?: (id: string) => void
}) {
  const [visibleCount, setVisibleCount] = useState(RENDER_PAGE)
  return (
    <>
      <Masonry>
        {bullets.slice(0, visibleCount).map((b) => (
          // Every card is already in THIS list, so no list line.
          <PrimaryCard
            key={b.id}
            id={b.id}
            url={b.url}
            title={b.title}
            description={b.description}
            imageUrl={b.image_url}
            screenshotUrl={b.screenshot_url}
            faviconUrl={b.favicon_url}
            cardType={b.card_type}
            imagePref={b.image_pref}
            place={b.place}
            product={b.product}
            customImage={b.customImage}
            utmCampaign={username}
            {...(owner
              ? { onOpen, outboundOverride: b.outbound_url, privateMark: !!b.is_private }
              : {})}
          />
        ))}
      </Masonry>
      {bullets.length > visibleCount && (
        <LoadMoreSentinel
          onReach={() => setVisibleCount((c) => Math.min(c + RENDER_PAGE, bullets.length))}
        />
      )}
    </>
  )
}
