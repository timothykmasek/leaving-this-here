// Rebrand header + the brand's [ bracket ] label motif. Spec from Figma
// ProjectX bulletin frame (node 695:856): centered BULLETIN wordmark, with a
// dot-cornered "SIGN UP" registration mark top-right.

import Link from 'next/link'

// The brand's signature label: `[ TEXT ]` in Routed Gothic Wide (.label),
// faded brackets. Used across the header, profile strip, and tabs.
export function BracketLabel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  // Inline (not flex) so long labels — e.g. a bio on mobile — wrap as text
  // with the brackets hugging the start/end, instead of overflowing.
  return (
    <span className={`label ${className}`}>
      <span aria-hidden className="opacity-40">[</span>{' '}
      {children}{' '}
      <span aria-hidden className="opacity-40">]</span>
    </span>
  )
}

export function BulletinHeader({
  action = { label: 'Sign up', href: '#' },
  actionExtra,
  logoClassName = 'h-[44px]',
  tagline,
  widthClassName = 'max-w-[1208px] px-4 sm:px-6',
  stickyLogo = false,
}: {
  // Pass `action={null}` for a logo-only header (e.g. auth pages).
  action?: { label: string; href?: string; onClick?: () => void } | null
  // Optional control(s) rendered just before the action mark on the right —
  // e.g. the profile's mobile search glass. Dressed by the caller.
  actionExtra?: React.ReactNode
  logoClassName?: string
  // Optional centred tagline (e.g. "A home for Tim's links" on a profile). When
  // present the logo sits left instead of centred.
  tagline?: React.ReactNode
  // The header's inner box. Must match whatever the page's content uses, or the
  // wordmark and the action mark stop lining up with the columns below them.
  // Defaults to the 1208 grid every other page still uses.
  widthClassName?: string
  // Pin the wordmark to the viewport so it survives the scroll, and blend it
  // against whatever passes beneath. Opt-in, and only worth it on the pages
  // with a card feed long enough to scroll under it (profile, list detail).
  stickyLogo?: boolean
} = {}) {
  const wordmark = (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/bulletin-logo.png" alt="Bulletin" className={`${logoClassName} w-auto`} />
  )
  // Plain Mier BOOK, no uppercase, no registration-mark dots (Figma node
  // 912:25144). The class said font-[500] — which is Mier REGULAR, a different
  // cut, because this family's numeric weights are inverted (Book is 400). So
  // the one nav item on the page was set in a face nothing else uses, which is
  // exactly why it read as foreign. 14/20 at 0.05em is the design system's
  // body-lg slot, verbatim.
  const actionInner = action ? (
    <span className="font-sans text-[14px] font-[400] leading-5 tracking-[0.05em] text-black/60 transition-colors group-hover:text-ink">
      {action.label}
    </span>
  ) : null
  return (
    <header className="py-6 sm:py-7">
      {/* Inner box matches the content width (max-w-[1208px] px-6) so the action
          mark lines up with the right card column, and the logo centers over it. */}
      {/* Mobile: logo sits on the SAME left gutter as the bio/nav below it, so the
          whole page shares one left edge. Desktop: centered masthead. */}
      <div className={`relative mx-auto flex items-center ${widthClassName} ${tagline || stickyLogo ? 'justify-start' : 'justify-start sm:justify-center'}`}>
        {/* wordmark — always links to "/". Logged-out visitors land on the
            homepage; logged-in users are server-redirected to their own profile
            (see app/page.tsx), so the logo is a universal "home". Centred by
            default; pinned left when a tagline occupies the centre. */}
        {stickyLogo ? (
          // Holds the row's height and the logo's left edge while the real
          // wordmark rides the viewport. A pinned logo also forces this row to
          // justify-start (above) even with no tagline: the pinned copy sits at
          // the container's left edge, so a centred spacer would put the two in
          // different places and the wordmark would jump on first scroll. `invisible` (not `hidden`) so it still
          // occupies space; aria-hidden so the pinned copy is the only link.
          <span aria-hidden className="invisible inline-flex">
            {wordmark}
          </span>
        ) : (
          <Link href="/" aria-label="Bulletin home" className="inline-flex">
            {wordmark}
          </Link>
        )}

        {/* centred tagline (desktop only — the phone masthead has no room) */}
        {tagline && (
          <span className="absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-serif text-[14px] tracking-[-0.01em] text-black/45 sm:block">
            {tagline}
          </span>
        )}

        {/* dot-cornered registration mark — sits on the content's right edge via
            ml-auto, so it tracks the container's padding at any width (it used
            to be absolutely pinned to right-4/sm:right-6, which only matched
            one of them). actionExtra rides just inside it. */}
        {(action || actionExtra) && (
          <span className="ml-auto flex shrink-0 items-center gap-4">
            {actionExtra}
            {action && (action.onClick ? (
              <button onClick={action.onClick} className="group shrink-0">
                {actionInner}
              </button>
            ) : (
              // <Link>, not <a>: this points at an internal route (/start), and a
              // plain anchor tears down the whole document and reloads the app
              // instead of doing a client transition.
              <Link href={action.href || '/'} className="group shrink-0">
                {actionInner}
              </Link>
            ))}
          </span>
        )}
      </div>

      {/* The wordmark that actually stays put. Two things make the blend work,
          and both are easy to undo by accident:

          1. The logo PNG is pure black, and difference computes
             |backdrop - source| — a black source returns the backdrop
             untouched, i.e. an invisible logo. `invert` flips it to white
             first, which is what gives black-on-paper and white-over-photo.
             Filters are applied to the element BEFORE it blends, so stacking
             both on one element is the correct order.
          2. mix-blend-mode blends against the backdrop of the element's PARENT
             stacking context. `position: fixed` always forms a stacking
             context, so the blend has to live on this wrapper — put it on an
             inner element and it would only ever blend with this box's own
             (empty) contents and do nothing. For the same reason nothing
             between here and <body> may set transform/filter/opacity/isolation,
             or the cards stop being part of the backdrop. */}
      {stickyLogo && (
        <div className="pointer-events-none fixed inset-x-0 top-0 z-40 py-6 mix-blend-difference invert sm:py-7">
          <div className={`mx-auto ${widthClassName}`}>
            <Link
              href="/"
              aria-label="Bulletin home"
              className="pointer-events-auto inline-flex"
            >
              {wordmark}
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
