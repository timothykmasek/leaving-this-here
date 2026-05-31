type Links = {
  twitter?: string
  linkedin?: string
  website?: string
}

// Normalizes a stored value into a usable href. Supports both:
//   - full URLs (the new format — "https://x.com/timmasek")
//   - legacy handles or partial paths (e.g. "timmasek" or "in/timmasek")
// `platformBase` is the URL prefix used when the value isn't a URL.
function toHref(value: string, platformBase: string): string {
  const v = value.trim()
  if (!v) return ''
  if (/^https?:\/\//i.test(v)) return v
  // legacy handle — strip a leading @ and prepend the platform base
  return platformBase + v.replace(/^@/, '').replace(/^\/+/, '')
}

function IconWrap({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
    >
      {children}
    </a>
  )
}

function XIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.339 18.337V9.973H5.667v8.364zM7.003 8.812a1.55 1.55 0 1 0 0-3.1 1.55 1.55 0 0 0 0 3.1zm11.335 9.525v-4.59c0-2.476-.537-4.38-3.43-4.38-1.39 0-2.323.762-2.704 1.485h-.037V9.973H9.62v8.364h2.67v-4.14c0-1.092.207-2.149 1.559-2.149 1.333 0 1.352 1.246 1.352 2.22v4.07z" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  )
}

export function SocialLinks({ links }: { links?: Links | null }) {
  if (!links) return null
  const twitter = links.twitter ? toHref(links.twitter, 'https://x.com/') : ''
  const linkedin = links.linkedin ? toHref(links.linkedin, 'https://linkedin.com/in/') : ''
  const website = links.website ? toHref(links.website, 'https://') : ''

  if (!twitter && !linkedin && !website) return null

  return (
    <div className="flex items-center gap-1 -ml-2">
      {twitter && (
        <IconWrap href={twitter} label="x.com profile">
          <XIcon />
        </IconWrap>
      )}
      {linkedin && (
        <IconWrap href={linkedin} label="linkedin profile">
          <LinkedInIcon />
        </IconWrap>
      )}
      {website && (
        <IconWrap href={website} label="website">
          <GlobeIcon />
        </IconWrap>
      )}
    </div>
  )
}
