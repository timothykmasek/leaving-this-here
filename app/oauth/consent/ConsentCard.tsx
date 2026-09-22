import Link from 'next/link'

// Presentational consent card, split from the page so /preview/consent can
// render it with fixtures — the real page only shows behind a live
// authorization_id + session, which nothing in dev can mint.

export function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="card-lift w-full max-w-[440px] rounded-[20px] bg-paper px-8 py-10 sm:px-10">
        <img src="/bulletin-logo.png" alt="Bulletin" className="mx-auto h-[28px] w-auto" />
        {children}
      </div>
    </main>
  )
}

export function ConsentCard({
  clientName,
  email,
  authorizationId,
}: {
  clientName: string
  email: string
  authorizationId: string
}) {
  const consentPath = `/oauth/consent?authorization_id=${authorizationId}`

  return (
    <ConsentShell>
      <h1 className="mt-8 text-center font-sans text-[22px] font-[600] leading-snug tracking-[-0.01em] text-ink">
        {clientName} wants to access your Bulletin
      </h1>

      <div className="mt-7 rounded-2xl bg-card px-5 py-4">
        <ul className="space-y-2.5">
          {['Read your bullets and lists', 'Save links and file them into lists'].map((line) => (
            <li key={line} className="flex items-baseline gap-3 font-serif text-[15px] leading-snug text-black/75">
              <span aria-hidden className="font-sans text-[13px] text-ink">✓</span>
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 font-serif text-[13px] italic leading-snug text-black/40">
          Saves only with your say-so. {clientName} can&rsquo;t delete anything.
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card font-sans text-[13px] font-[600] uppercase text-black/40">
            {email.slice(0, 1)}
          </span>
          <span className="truncate font-sans text-[14px] text-ink">{email}</span>
        </div>
        <Link
          href={`/login?next=${encodeURIComponent(consentPath)}`}
          className="shrink-0 font-serif text-[13px] text-black/40 underline transition-colors hover:text-ink"
        >
          switch
        </Link>
      </div>

      <form method="post" action="/api/oauth/decision" className="mt-8">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button
          type="submit"
          name="decision"
          value="approve"
          className="w-full rounded-lg bg-ink py-3.5 font-sans text-[15px] font-[600] text-paper transition-opacity hover:opacity-85"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="deny"
          className="mt-3 w-full py-2 font-sans text-[14px] text-black/45 transition-colors hover:text-ink"
        >
          Deny
        </button>
      </form>

      <p className="mt-7 text-center font-serif text-[12.5px] leading-snug text-black/35">
        You can disconnect anytime from {clientName}&rsquo;s connector settings.
      </p>
    </ConsentShell>
  )
}
