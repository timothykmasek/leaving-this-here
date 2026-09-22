// The "Create New List" card — the owner's door at the end of the LISTS grid
// (Figma 1132:79672): a collection card with nothing in it yet. Same plate,
// a + where the filmstrip would be, and the prompt where the name goes.
//
// A door, not a form. It used to turn itself into an input with Create and
// Cancel inside the plate — the only control in the app that grew out of a
// card — and then dropped you into the empty list it had just made. Now it
// opens the bottom-right dock in its "new list" flow (components/ImportFab):
// name the list there, then feed it with the same Add Bullet / Bulk Import
// doors every other save goes through. The plate never changes shape.

'use client'

export function CreateListCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative block aspect-square w-full overflow-hidden rounded-[20px] bg-card text-left ring-1 ring-black/[0.03] card-lift"
    >
      {/* The + sits at the card's true center, 45/295 of the plate wide so it
          scales with the column like the filmstrip does. Same 2px stroke both
          bars. */}
      <svg
        aria-hidden
        viewBox="0 0 45 45"
        fill="none"
        className="absolute left-1/2 top-1/2 w-[15.25%] -translate-x-1/2 -translate-y-1/2"
      >
        <line x1="22.5" y1="0" x2="22.5" y2="45" stroke="#B8B8B8" strokeWidth="2" />
        <line x1="0" y1="22.5" x2="45" y2="22.5" stroke="#B8B8B8" strokeWidth="2" />
      </svg>
      {/* Prompt at the CollectionCard's exact anchor. Cardo REGULAR 18 (not
          the list name's Bold 16) — the Figma draws the prompt a step lighter
          and larger than a real name, so it reads as an invitation, not an
          item. No count line: a list that doesn't exist has nothing to count,
          and "0 items" read as a real (empty) list. */}
      <span className="absolute inset-x-5 bottom-5 block font-serif text-[18px] leading-5 tracking-[-0.02em] text-black/70">
        Create New List
      </span>
    </button>
  )
}
