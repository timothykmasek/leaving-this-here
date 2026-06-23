// Bulletin "collection card" — a list rendered as a plate in the profile's
// LISTS tab. Same 272×270 footprint as the link card, with a collage of member
// thumbnails and a centered list name + [ N items ]. Spec echoes the homepage
// frame's "SAMPLE COLLECTION · 60 ITEMS" card.

function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[7px] w-[7px] rounded-full bg-black/20 ${className}`} />
}

export function CollectionCard({
  name,
  count,
  thumbs,
  isPrivate,
  onClick,
}: {
  name: string
  count: number
  thumbs: string[]
  isPrivate?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="relative block aspect-[272/270] w-full overflow-hidden rounded-[20px] bg-card text-left shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
    >
      <Rivet className="left-[7.4%] top-[7.4%]" />
      <Rivet className="right-[7.4%] top-[7.4%]" />
      <Rivet className="bottom-[7.4%] left-[7.4%]" />
      <Rivet className="bottom-[7.4%] right-[7.4%]" />

      {/* collage — up to 4 member thumbnails, 67.6% wide @ (16.2%, 21.9%) */}
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

      {/* centered name + item count */}
      <div className="absolute left-1/2 top-[71%] w-[76%] -translate-x-1/2 text-center">
        <div className="label line-clamp-2 leading-[14px] text-ink">{name}</div>
        <div className="label mt-[7px] text-black/40">
          [ {count} {count === 1 ? 'item' : 'items'}{isPrivate ? ' · private' : ''} ]
        </div>
      </div>
    </button>
  )
}
