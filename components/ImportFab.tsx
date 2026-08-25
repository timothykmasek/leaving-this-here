import Link from 'next/link'

// The owner's persistent "add links" affordance — a frosted tile that floats
// over the feed and follows you down the page, into /import.
//
// It exists because import was reachable from exactly one place: a small
// "Import" label in the site footer, which is the least-discovered spot on the
// page. For a thin profile, a bulk import is the fastest route to a page that
// looks like something.
//
// Bottom-right, not top-right. The top-right of a profile already holds the tab
// pill and the header's Log out, and the top-left holds the pinned wordmark —
// bottom-right is the one corner with nothing in it, and it's where a persistent
// add action is conventionally looked for.
//
// Sized down hard from the Figma tile (179px square). Tim: "Small." At 64 it
// reads as a control rather than a card, and it takes the system's own
// rounded-[20px] instead of the export's 30, which is proportionally close and
// matches every other surface here.
//
// z-40 puts it above the revealed footer bar (z-30) and level with the pinned
// wordmark, which is diagonally opposite and can't collide.
//
// It stands down while that footer bar is revealed. Two reasons, and the second
// is the better one: at z-40 over a z-30 bar it sat directly on top of the
// footer's own links — but also, that bar carries an "Import" link of its own.
// With the bar up, this button is a second route to a destination already
// offered a few pixels away, so hiding it removes a collision AND a duplicate.
// Matches the bar's own 340ms curve so the two move as one gesture rather than
// two things happening at once.

export function ImportFab({ hidden = false }: { hidden?: boolean }) {
  return (
    <Link
      href="/import"
      aria-label="Import links"
      title="Import links"
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      className={`group fixed bottom-6 right-6 z-40 hidden h-16 w-16 items-center justify-center rounded-[20px] transition-all duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98] sm:flex ${
        hidden ? 'pointer-events-none translate-y-3 opacity-0' : 'translate-y-0 opacity-100'
      }`}
      style={{
        // Frosted, per the handoff: it takes its colour from whatever it's over.
        // The radial overlay is Figma's, approximated — the export's own note
        // says its rotation isn't expressible in CSS.
        background:
          'radial-gradient(140% 140% at 0% 0%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.067) 77%, rgba(0,0,0,0) 100%)',
        boxShadow: 'inset 0.93px 7.45px 10.25px rgba(255,255,255,0.55)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* The plus as two bars rather than a glyph, so the stroke stays exactly
          2px and the arms stay exactly equal at any size — a font's "+" gives
          neither. */}
      <span aria-hidden className="relative block h-4 w-4">
        <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-white" />
        <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-white" />
      </span>
    </Link>
  )
}
