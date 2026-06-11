import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'privacy · according to',
  description: 'What according to collects, why, and what happens to it.',
}

// Plain-language privacy policy. Required by the Chrome Web Store listing and
// linked from the extension; covers the web app too. Keep honest and short —
// update this page whenever data handling actually changes.
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper">
      <div className="mx-auto max-w-2xl px-6 py-16 sm:px-8">
        <h1 className="font-serif text-3xl font-normal tracking-tight text-ink mb-2">
          privacy
        </h1>
        <p className="text-sm text-stone-500 mb-10">
          last updated june 11, 2026 · applies to according-to.com and the
          according to Chrome extension
        </p>

        <div className="space-y-8 text-[15px] leading-relaxed text-stone-700">
          <section>
            <h2 className="font-serif text-lg text-ink mb-2">the short version</h2>
            <p>
              according to is a place to save and publicly share links. We
              collect what&rsquo;s needed to run that — your account, the things
              you save — and nothing else. We don&rsquo;t sell your data, we
              don&rsquo;t run ads, and we don&rsquo;t track you around the web.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">what we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-ink">Account info.</strong> When you sign
                in with Google we receive your email address and name. That&rsquo;s
                how your account exists.
              </li>
              <li>
                <strong className="text-ink">What you save.</strong> When you save
                a link — from the website, the bookmarklet, or the Chrome
                extension — we store the URL, the page&rsquo;s title and
                description, its preview image, and any quote or note you attach.
              </li>
              <li>
                <strong className="text-ink">Your profile.</strong> The handle,
                display name, and bio you choose.
              </li>
            </ul>
            <p className="mt-3">
              The Chrome extension only sends data when you actively save
              something: the page&rsquo;s URL and title (plus the image or
              selected text, if that&rsquo;s what you saved) and your sign-in
              token. It does not read your browsing history or watch the pages
              you visit.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">what&rsquo;s public</h2>
            <p>
              according to is public by design: everything you save appears on
              your public page (according-to.com/yourhandle), unless it&rsquo;s in
              a private list. Your email address is never public.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">services we rely on</h2>
            <p>
              Your data is processed by a small set of infrastructure providers,
              strictly to run the product: Supabase (database, authentication),
              Vercel (hosting), Anthropic (suggests names for your lists from a
              saved page&rsquo;s title), Voyage AI (powers search over your own
              saves), and link-preview services that fetch a page&rsquo;s public
              metadata and screenshot. None of them are permitted to use your
              data for anything else.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">what we don&rsquo;t do</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>No selling or renting your data, ever.</li>
              <li>No advertising, no third-party trackers.</li>
              <li>No reading your browsing activity — saves happen only when you click save.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">deleting your stuff</h2>
            <p>
              You can delete any save from your page at any time, and deleting is
              permanent. To delete your whole account and everything in it, email
              us and we&rsquo;ll do it promptly.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-lg text-ink mb-2">contact</h2>
            <p>
              Questions about any of this:{' '}
              <a
                href="mailto:tim@according-to.com"
                className="underline underline-offset-4 text-ink"
              >
                tim@according-to.com
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
