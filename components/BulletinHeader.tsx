// Rebrand header + the brand's [ bracket ] label motif. Spec from Figma
// ProjectX bulletin frame (node 695:856): centered BULLETIN wordmark, with a
// dot-cornered "SIGN UP" registration mark top-right.

// The brand's signature label: `[ TEXT ]` in Routed Gothic Wide (.label),
// faded brackets. Used across the header, profile strip, and tabs.
export function BracketLabel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={`label inline-flex items-center gap-[6px] ${className}`}>
      <span aria-hidden className="opacity-40">[</span>
      <span className="whitespace-nowrap">{children}</span>
      <span aria-hidden className="opacity-40">]</span>
    </span>
  )
}

// Corner dot for the SIGN UP registration mark (4px).
function Dot({ className }: { className: string }) {
  return (
    <span aria-hidden className={`absolute h-[4px] w-[4px] rounded-full bg-black/[0.35] ${className}`} />
  )
}

export function BulletinHeader({
  action = { label: 'Sign up', href: '#' },
  logoClassName = 'h-[34px]',
}: {
  action?: { label: string; href?: string; onClick?: () => void }
  logoClassName?: string
} = {}) {
  const actionInner = (
    <span className="relative inline-block px-[20px] py-[11px]">
      <span className="label text-black/60 transition-colors group-hover:text-ink">{action.label}</span>
      <Dot className="left-0 top-0" />
      <Dot className="right-0 top-0" />
      <Dot className="bottom-0 left-0" />
      <Dot className="bottom-0 right-0" />
    </span>
  )
  return (
    <header className="relative flex items-center justify-center px-10 py-7">
      {/* centered wordmark (logo image) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/bulletin-logo.png" alt="Bulletin" className={`${logoClassName} w-auto`} />

      {/* dot-cornered registration mark, top-right — button (sign-out) or link */}
      {action.onClick ? (
        <button onClick={action.onClick} className="group absolute right-10 top-1/2 -translate-y-1/2">
          {actionInner}
        </button>
      ) : (
        <a href={action.href} className="group absolute right-10 top-1/2 -translate-y-1/2">
          {actionInner}
        </a>
      )}
    </header>
  )
}
