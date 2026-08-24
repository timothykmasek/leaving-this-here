// The loading placeholder for a feed of bullets.
//
// It mirrors <Masonry> deliberately: the same 4 / 3 / 2 responsive columns and
// the same 40px gaps, with plates of UNEVEN height. A skeleton whose shape
// disagrees with the content replacing it is worse than no skeleton — the page
// visibly re-lays-out on arrival, which reads as a bug. This one previously
// drew a left-packed grid of near-square 272×270 plates, a layout the app
// stopped using when the feed became a masonry of tall cards.
//
// Heights are a fixed pattern, not random: this renders on the server, so a
// random height would differ from the client's and trip hydration. They're
// aspect ratios rather than pixels so the plates scale with the column, exactly
// as the real cards do.

// Roughly the spread of real PrimaryCard heights at one column's width.
const COLUMNS = [
  ['295/430', '295/310', '295/380'],
  ['295/340', '295/470', '295/300'],
  ['295/490', '295/320', '295/410'],
  ['295/355', '295/445', '295/330'],
]

// Columns 3 and 4 appear only where Masonry itself adds them.
const COLUMN_VISIBILITY = ['flex', 'flex', 'hidden sm:flex', 'hidden lg:flex']

export function MasonrySkeleton() {
  return (
    <div className="flex gap-x-[40px]" aria-hidden>
      {COLUMNS.map((plates, col) => (
        <div
          key={col}
          className={`min-w-0 flex-1 flex-col gap-y-[40px] ${COLUMN_VISIBILITY[col]}`}
        >
          {plates.map((aspect, i) => (
            <div
              key={i}
              className="w-full animate-pulse rounded-[20px] bg-card"
              style={{ aspectRatio: aspect.replace('/', ' / ') }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
