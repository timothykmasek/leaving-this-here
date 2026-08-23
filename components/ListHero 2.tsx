// The centred masthead for a list page: count, name, description.
//
// Replaces the old left-aligned block (← back / italic serif title / meta row)
// and the ProfileIdentity strip that sat above it. Owner context now lives in
// the header tagline, which links back to the profile, so the page itself can
// be just the list.
//
// `children` is the owner slot — the edit affordance sits under the description.

import Link from 'next/link'

export function ListHero({
  count,
  name,
  description,
  isPrivate = false,
  children,
}: {
  count: number
  name: string
  description?: string | null
  isPrivate?: boolean
  children?: React.ReactNode
}) {
  return (
    <header className="mx-auto max-w-[720px] px-4 pb-10 pt-4 text-center sm:pb-14 sm:pt-8">
      <p className="font-sans text-[14px] leading-5 text-ink/[0.45]">
        {count} {count === 1 ? 'Bullet' : 'Bullets'}
        {isPrivate && <span className="text-ink/[0.35]"> · Private</span>}
      </p>

      <h1 className="mt-2 font-sans text-[32px] font-[700] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[40px]">
        {name}
      </h1>

      {description && (
        <p className="mx-auto mt-3 max-w-[520px] font-serif text-[16px] leading-[1.45] text-ink/[0.55]">
          {description}
        </p>
      )}

      {children && <div className="mt-5">{children}</div>}
    </header>
  )
}

/** The header tagline on a list page. This is the way back to the profile —
 *  the mockup's "A link for links: My Profile" — which is why the page body no
 *  longer carries its own "← back" link. Underline treatment matches the
 *  profile masthead, where the owner's name is the underlined part. */
export function ListTagline({
  username,
  ownerName,
  isOwner,
}: {
  username: string
  ownerName: string
  isOwner: boolean
}) {
  return (
    <>
      A link for links:{' '}
      <Link
        href={`/${username}`}
        className="text-ink underline decoration-black/20 underline-offset-2 transition-colors hover:decoration-black/50"
      >
        {isOwner ? 'My Profile' : `${ownerName.split(' ')[0]}\u2019s Profile`}
      </Link>
    </>
  )
}
