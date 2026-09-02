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
// ── Where it sits ──────────────────────────────────────────────────────────
//
// On the grid's right edge, not the viewport's. It used to be `right-6`, which
// put it 24px from the window while the cards stopped at the grid's padding —
// so it hung outside the column it belongs to, by a different amount at every
// width. The same fixed-full-width-then-mx-auto trick BulletinHeader uses for
// the pinned wordmark keeps it on the same line the cards end on.
//
// Parked ABOVE where the revealed footer bar lands, permanently, rather than
// getting out of its way. It used to fade out whenever that bar came up, so
// scrolling up made the button vanish — which reads as losing a control, not
// as tidying. Sitting clear of the bar means nothing has to move at all.
//
// The clearance is the bar's own height plus a gap. That bar is
// border(1) + pt-[18px] + one .label line(12px) + pb-[max(18px,safe-area)],
// so 31px plus that bottom padding; 24px of air on top of it. Expressed as a
// calc so the iOS safe-area inset is carried through rather than guessed at.
const FOOTER_CLEARANCE = 'calc(55px + max(18px, env(safe-area-inset-bottom)))'

export function ImportFab({
  // Must match the page's grid, or the button lands off the column edge — the
  // same contract SiteFooter's widthClassName has, for the same reason.
  widthClassName = 'max-w-[1720px] px-4 sm:px-10',
}: {
  widthClassName?: string
}) {
  return (
    // The wrapper spans the viewport so its inner row can be centred on the
    // grid; it must not swallow clicks meant for the feed underneath, hence
    // pointer-events-none here and auto on the button itself.
    <div
      className="pointer-events-none fixed inset-x-0 z-40"
      style={{ bottom: FOOTER_CLEARANCE }}
    >
      <div className={`mx-auto flex ${widthClassName} justify-end`}>
        {/* On phones too, since the mobile search glass moved to the header and
            freed this corner — the one thumb-reach spot with nothing in it.
            56px there (the old mobile search circle's scale); 64 from sm up. */}
        <Link
          href="/import"
          aria-label="Import links"
          title="Import links"
          className="group pointer-events-auto flex h-14 w-14 items-center justify-center rounded-[18px] transition-transform duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.04] active:scale-[0.98] sm:h-16 sm:w-16 sm:rounded-[20px]"
          style={{
            // Frosted, per the handoff: it takes its colour from whatever it's
            // over. The radial overlay is Figma's, approximated — the export's
            // own note says its rotation isn't expressible in CSS.
            background:
              'radial-gradient(140% 140% at 0% 0%, rgba(0,0,0,0.03) 0%, rgba(0,0,0,0.067) 77%, rgba(0,0,0,0) 100%)',
            boxShadow: 'inset 0.93px 7.45px 10.25px rgba(255,255,255,0.55)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
          }}
        >
          {/* The plus as two bars rather than a glyph, so the stroke stays
              exactly 2px and the arms stay exactly equal at any size — a font's
              "+" gives neither. */}
          <span aria-hidden className="relative block h-4 w-4">
            <span className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 rounded-full bg-white" />
            <span className="absolute left-1/2 top-0 h-full w-[2px] -translate-x-1/2 rounded-full bg-white" />
          </span>
        </Link>
      </div>
    </div>
  )
}
