// Centered identity block — the author's name (Mier Headline), bio (Cardo
// Editorial), a row of social links, and an optional owner control (edit).
// Shared by the profile hero and the public list page so landing on
// /username/<slug> keeps the same author context.
import type { ReactNode } from 'react'
import { detectPlatform, normalizeProfileLinks } from '@/lib/profileLinks'

// Small monochrome glyphs for each link — same grey as the surrounding text
// (they inherit currentColor), matching the quiet UI motif, not coloured logos.
export const LINK_ICONS: Record<string, ReactNode> = {
  x: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  ),
  website: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.6 5.7 3.6 9s-1.1 6.4-3.6 9c-2.5-2.6-3.6-5.7-3.6-9s1.1-6.4 3.6-9z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  ),
  substack: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M22.539 8.242H1.46V5.406h21.08v2.836zM1.46 10.812V24L12 18.11 22.539 24V10.812H1.46zM22.539 0H1.46v2.836h21.08V0z" />
    </svg>
  ),
  tiktok: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden>
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
}

export function ProfileIdentity({
  name,
  bio,
  latestBullet,
  links,
  trailing,
}: {
  name: string
  // Bio — up to two short lines, stored newline-separated.
  bio?: string | null
  // "Latest Bullet: …" line (owner's most recent save, in the viewer's local
  // time). Rendered as the bottom editorial line under the bio.
  latestBullet?: string | null
  // Legacy fixed-key object OR the editor's ordered url array — both render.
  links?: Record<string, string> | string[] | null
  // Optional owner control rendered beneath the links (edit-profile pencil).
  trailing?: ReactNode
}) {
  const entries = normalizeProfileLinks(links).map((url) => ({
    url,
    platform: detectPlatform(url),
  }))

  return (
    <div className="group flex flex-col items-center gap-3 text-center">
      {/* Name — Mier Headline/Large */}
      <h1 className="font-sans text-[20px] font-[600] leading-[24px] text-ink">{name}</h1>

      {/* Bio (up to 2 lines) + the auto "Latest Bullet" line, as one tight
          editorial block — Cardo, centred. */}
      {(bio || latestBullet) && (
        <div className="flex max-w-md flex-col items-center font-serif text-[14px] leading-[22px] tracking-[-0.01em] text-black/60">
          {bio && <p className="whitespace-pre-line">{bio}</p>}
          {latestBullet && <p>{latestBullet}</p>}
        </div>
      )}

      {/* Social links — below the identity lines */}
      {entries.length > 0 && (
        <div className="mt-1 flex items-center gap-4 text-black/40">
          {entries.map((e) => (
            <a
              key={e.url}
              href={e.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={e.platform}
              title={e.platform}
              className="inline-flex transition-colors hover:text-ink"
            >
              {LINK_ICONS[e.platform] ?? LINK_ICONS.website}
            </a>
          ))}
        </div>
      )}

      {/* Owner control (edit profile) */}
      {trailing}
    </div>
  )
}
