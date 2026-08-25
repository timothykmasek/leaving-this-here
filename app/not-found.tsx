import Link from 'next/link'

// A real 404, with a real status code.
//
// Unknown paths used to fall through to /[username], which treated the path as
// a username, found nobody, and returned the profile shell with HTTP 200 —
// carrying full metadata, so /robots.txt served a page titled
// "robots.txt · Bulletin" that a crawler was entitled to index. Anything not
// found now says so, in the status line as well as on the page.

export default function NotFound() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1720px] px-4 py-24 text-center sm:px-10">
        <p className="font-sans text-[12px] uppercase leading-4 tracking-[0.05em] text-black/40">
          404
        </p>
        <h1 className="mt-4 font-serif text-[20px] leading-7 text-black/70">
          Nothing here.
        </h1>
        <p className="mx-auto mt-2 max-w-[36ch] font-serif text-[14px] leading-[22px] text-black/50">
          This page may have moved, or the name may be spelled differently.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block font-sans text-[12px] leading-4 tracking-[0.05em] text-black/45 underline transition-colors hover:text-ink"
        >
          Back to Bulletin
        </Link>
      </div>
    </main>
  )
}
