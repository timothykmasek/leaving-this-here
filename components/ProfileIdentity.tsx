// Read-only identity strip — the brand's `[ NAME ]` bracket label, with the bio
// and social links sharing one line below it. Shared by the profile hero and the
// public list page so landing on /username/<slug> keeps the same author context.
import type { ReactNode } from 'react'
import { BracketLabel } from '@/components/BulletinHeader'

// Small monochrome glyphs for each link — same grey as the surrounding text
// (they inherit currentColor), matching the label motif instead of coloured logos.
const LINK_ICONS: Record<string, ReactNode> = {
  twitter: (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.6 5.7 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.7-3.6-9s1.1-6.4 3.6-9z" />
    </svg>
  ),
}

export function ProfileIdentity({
  name,
  bio,
  links,
  trailing,
}: {
  name: string
  bio?: string | null
  links?: Record<string, string> | null
  // Optional node rendered inline at the end of the bio/links line (e.g. the
  // owner's edit-profile control on their own profile).
  trailing?: ReactNode
}) {
  const l = links || {}
  const entries = (
    [
      ['twitter', 'x', l.twitter],
      ['linkedin', 'linkedin', l.linkedin],
      ['website', 'website', l.website],
    ] as [string, string, string | undefined][]
  ).filter((e) => e[2])

  const hasSecondLine = !!bio || entries.length > 0 || !!trailing

  return (
    <div className="flex min-w-0 max-w-full flex-col items-start gap-2 text-black/50">
      <BracketLabel>{name}</BracketLabel>
      {hasSecondLine && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {bio && <BracketLabel className="bio-label">{bio}</BracketLabel>}
          {entries.length > 0 && (
            <span className="label inline-flex items-center gap-[10px] text-black/50">
              <span aria-hidden className="opacity-40">[</span>
              {entries.map((e) => (
                <a
                  key={e[0]}
                  href={e[2]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={e[1]}
                  title={e[1]}
                  className="inline-flex transition-colors hover:text-ink"
                >
                  {LINK_ICONS[e[0]]}
                </a>
              ))}
              <span aria-hidden className="opacity-40">]</span>
            </span>
          )}
          {trailing}
        </div>
      )}
    </div>
  )
}
