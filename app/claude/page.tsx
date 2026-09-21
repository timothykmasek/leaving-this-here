import type { Metadata } from 'next'
import { BulletinHeader } from '@/components/BulletinHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CopyConnectorUrl } from './CopyConnectorUrl'

// /claude — the Claude connector's entire product surface: pitch, connector
// URL, three setup steps. Doubles as the marketing page (the link that goes in
// a tweet or the claim email), so it reads editorial, not developer-docs.
// The connector itself is app/api/mcp, served at /mcp via rewrite.

// The personal mount: adding it walks the user through Bulletin's OAuth
// consent, then Claude is signed in as them. The anonymous /mcp mount stays
// for people without an account (footnote below).
const CONNECTOR_URL = 'https://www.yourbulletin.com/mcp/me'

export const metadata: Metadata = {
  title: 'Bulletin × Claude',
  description:
    'Connect Bulletin to Claude: every link you save becomes context your AI can draw on.',
}

// The copy box rides under step 02 — the URL appears at the moment the reader
// needs it, not before the steps that lead there.
const STEPS: [string, React.ReactNode, boolean?][] = [
  ['01', <>In Claude, open <strong className="font-[600] text-ink">Settings → Connectors</strong>.</>],
  ['02', <>Add a custom connector and paste in this URL:</>, true],
  ['03', <>Approve on Bulletin&rsquo;s consent screen. Done&thinsp;&mdash;&thinsp;ask Claude about anything you&rsquo;ve saved.</>],
]

export default function ClaudePage() {
  return (
    <main className="min-h-screen">
      <BulletinHeader action={null} logoClassName="h-[32px] sm:h-[44px]" />

      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 sm:px-8 sm:pt-16">
        {/* Lockup — Mier Book 400, the intended editorial weight (see fonts.ts:
            don't bump it back to 600/700 because it "looks light"). */}
        <h1 className="text-balance text-center font-sans text-[34px] font-[400] leading-[1.1] tracking-[-0.02em] text-ink sm:text-[44px]">
          Your bulletin, in Claude&rsquo;s head.
        </h1>
        <p className="mx-auto mt-4 max-w-[34rem] text-center font-serif text-[18px] leading-[1.5] text-black/60 sm:text-[19px]">
          Every link you save becomes context your AI can draw on. Connect
          once&thinsp;&mdash;&thinsp;Claude can search your bullets and lists in
          any conversation, from then on.
        </p>

        {/* One illustrative moment, not a feature list. */}
        <div className="card-lift mt-12 rounded-[20px] bg-paper p-6 sm:p-8">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-md bg-card px-4 py-2.5 font-sans text-[15px] leading-snug text-ink">
              what was that piece I saved on pricing psychology?
            </div>
          </div>
          <p className="mt-5 max-w-[90%] font-serif text-[16px] leading-[1.55] text-black/75">
            Found it in your bullets&thinsp;&mdash;&thinsp;
            <em>&ldquo;Why $9.99 works better than $10&rdquo;</em>, saved to
            your Reading list.
          </p>
        </div>

        {/* Setup steps, with the connector URL under the step that uses it */}
        <ol className="mt-14 space-y-6">
          {STEPS.map(([n, body, withUrl]) => (
            <li key={n}>
              <div className="flex items-baseline gap-5">
                <span className="w-7 shrink-0 font-sans text-[13px] font-[600] tracking-[0.08em] text-black/35">
                  {n}
                </span>
                <span className="font-serif text-[17px] leading-[1.5] text-black/70">{body}</span>
              </div>
              {withUrl && (
                <div className="mt-4 sm:ml-12">
                  <CopyConnectorUrl url={CONNECTOR_URL} />
                </div>
              )}
            </li>
          ))}
        </ol>

        {/* Footnote-weight mentions, not sections. */}
        <p className="mt-14 border-t border-black/[0.06] pt-6 font-serif text-[14px] leading-[1.6] text-black/40">
          No Bulletin account? Add{' '}
          <code className="font-mono text-[12.5px]">yourbulletin.com/mcp</code>{' '}
          instead&thinsp;&mdash;&thinsp;it reads any published bulletin, no
          sign-in. Either way it&rsquo;s read-only: Claude can&rsquo;t save,
          edit or delete anything.
        </p>
      </div>

      <SiteFooter widthClassName="max-w-2xl px-6 sm:px-8" />
    </main>
  )
}
