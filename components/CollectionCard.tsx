// Bulletin "collection card" — a list rendered as a plate in the profile's
// LISTS tab. Same 272×270 footprint as the link card, with a collage of member
// thumbnails and a centered list name + [ N items ]. Spec echoes the homepage
// frame's "SAMPLE COLLECTION · 60 ITEMS" card.

function Rivet({ className }: { className: string }) {
  return <span aria-hidden className={`absolute h-[8px] w-[8px] rounded-full bg-black/20 ${className}`} />
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
      className="relative block h-[270px] w-[272px] overflow-hidden rounded-[20px] bg-card text-left shadow-[0_4px_18px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.03] transition-shadow hover:shadow-[0_8px_28px_rgba(0,0,0,0.10)]"
    >
      <Rivet className="left-[20px] top-[20px]" />
      <Rivet className="right-[20px] top-[20px]" />
      <Rivet className="bottom-[20px] left-[20px]" />
      <Rivet className="bottom-[20px] right-[20px]" />

      {/* collage — up to 4 member thumbnails @ (44,59) */}
      <div className="absolute left-[44px] top-[59px] grid h-[118px] w-[184px] grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[10px] bg-black/[0.06]">
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
      <div className="absolute left-1/2 top-[192px] w-[208px] -translate-x-1/2 text-center">
        <div className="label line-clamp-2 leading-[14px] text-ink">{name}</div>
        <div className="label mt-[7px] text-black/40">
          [ {count} {count === 1 ? 'item' : 'items'}{isPrivate ? ' · private' : ''} ]
        </div>
      </div>
    </button>
  )
}
