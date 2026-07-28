'use client'

// The dignified no-image fallback: the site's favicon over its domain, so a
// card with no usable image reads as an intentional branded plate instead of an
// empty grey box. Its own client component because the favicon's onError (hide
// a broken favicon) can't be passed from a server component (LinkCard) across
// the client boundary into CardThumb's `fallback` prop.
export function FaviconPlate({
  faviconUrl,
  domain,
}: {
  faviconUrl?: string | null
  domain: string
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3">
      {faviconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconUrl}
          alt=""
          className="h-6 w-6 rounded-[5px] opacity-70"
          onError={(e) => {
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
          }}
        />
      ) : null}
      <span className="label text-center text-black/30">{domain}</span>
    </div>
  )
}
