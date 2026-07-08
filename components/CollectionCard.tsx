// Bulletin "collection card" — a list rendered as a plate in the profile's
// LISTS tab. Same 272×270 footprint as the link card, with a collage of member
// thumbnails and a centered list name + [ N items ]. Spec echoes the homepage
// frame's "SAMPLE COLLECTION · 60 ITEMS" card.

import Link from 'next/link'

function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[7px] w-[7px] rounded-full bg-[#d9d9d9] ${className}`} />
}

export function CollectionCard({
  name,
  count,
  thumbs,
  isPrivate,
  onClick,
  href,
}: {
  name: string
  count: number
  thumbs: string[]
  isPrivate?: boolean
  onClick?: () => void
  // When set, the card is a real link to the list's public URL (visitors go
  // straight to /username/<slug>). Otherwise it's a button (owner in-page view).
  href?: string
}) {
  const className =
    'relative block aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card text-left shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]'
  // Small lists (≤3 links) show a single big preview of the latest link rather
  // than a sparse 2×2 grid; the collage only earns its keep at 4+ members.
  const single = count <= 3
  const inner = (
    <>
      <Rivet className="left-[7.4%] top-[7.4%]" />
      <Rivet className="right-[7.4%] top-[7.4%]" />
      <Rivet className="bottom-[7.4%] left-[7.4%]" />
      <Rivet className="bottom-[7.4%] right-[7.4%]" />

      {/* preview — 67.6% wide @ (16.2%, 21.9%). One big thumb for small lists,
          a 4-up collage once there are enough members to fill it. */}
      {single ? (
        <div className="absolute left-[16.2%] top-[21.9%] aspect-[184/118] w-[67.6%] overflow-hidden rounded-[10px] bg-black/[0.06]">
          {thumbs[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbs[0]} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ) : (
        <div className="absolute left-[16.2%] top-[21.9%] aspect-[184/118] grid w-[67.6%] grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[10px] bg-black/[0.06]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="overflow-hidden bg-black/[0.04]">
              {thumbs[i] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbs[i]} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* centered name + item count */}
      <div className="absolute left-1/2 top-[71%] w-[76%] -translate-x-1/2 text-center">
        <div className="label line-clamp-2 leading-[14px] text-ink">{name}</div>
        <div className="label mt-[7px] text-black/40">
          [ {count} {count === 1 ? 'item' : 'items'}{isPrivate ? ' · private' : ''} ]
        </div>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    )
  }
  return (
    <button onClick={onClick} className={className}>
      {inner}
    </button>
  )
}
