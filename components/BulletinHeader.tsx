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
  logoClassName = 'h-[44px]',
  tagline,
  widthClassName = 'max-w-[1208px] px-4 sm:px-6',
}: {
  // Pass `action={null}` for a logo-only header (e.g. auth pages).
  action?: { label: string; href?: string; onClick?: () => void } | null
  logoClassName?: string
  // Optional centred tagline (e.g. "A home for Tim's links" on a profile). When
  // present the logo sits left instead of centred.
  tagline?: React.ReactNode
  // The header's inner box. Must match whatever the page's content uses, or the
  // wordmark and the action mark stop lining up with the columns below them.
  // Defaults to the 1208 grid every other page still uses.
  widthClassName?: string
} = {}) {
  // Plain Mier Book text, 70% ink, slight tracking (Figma node 912:25144) — no
  // uppercase, no registration-mark dots.
  const actionInner = action ? (
    <span className="font-sans text-[14px] font-[500] tracking-[0.5px] text-black/70 transition-colors group-hover:text-ink">
      {action.label}
    </span>
  ) : null
  return (
    <header className="py-6 sm:py-7">
      {/* Inner box matches the content width (max-w-[1208px] px-6) so the action
          mark lines up with the right card column, and the logo centers over it. */}
      {/* Mobile: logo sits on the SAME left gutter as the bio/nav below it, so the
          whole page shares one left edge. Desktop: centered masthead. */}
      <div className={`relative mx-auto flex items-center ${widthClassName} ${tagline ? 'justify-start' : 'justify-start sm:justify-center'}`}>
        {/* wordmark — always links to "/". Logged-out visitors land on the
            homepage; logged-in users are server-redirected to their own profile
            (see app/page.tsx), so the logo is a universal "home". Centred by
            default; pinned left when a tagline occupies the centre. */}
        <Link href="/" aria-label="Bulletin home" className="inline-flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bulletin-logo.png" alt="Bulletin" className={`${logoClassName} w-auto`} />
        </Link>

        {/* centred tagline (desktop only — the phone masthead has no room) */}
        {tagline && (
          <span className="absolute left-1/2 hidden -translate-x-1/2 whitespace-nowrap font-serif text-[14px] tracking-[-0.01em] text-black/45 sm:block">
            {tagline}
          </span>
        )}

        {/* dot-cornered registration mark — sits on the content's right edge via
            ml-auto, so it tracks the container's padding at any width (it used
            to be absolutely pinned to right-4/sm:right-6, which only matched
            one of them). */}
        {action && (action.onClick ? (
          <button onClick={action.onClick} className="group ml-auto shrink-0">
            {actionInner}
          </button>
        ) : (
          <a href={action.href} className="group ml-auto shrink-0">
            {actionInner}
          </a>
        ))}
      </div>
    </header>
  )
}
