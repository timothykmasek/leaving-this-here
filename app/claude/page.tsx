import type { Metadata } from 'next'
import { BulletinHeader } from '@/components/BulletinHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { CopyConnectorUrl } from './CopyConnectorUrl'

// /claude — the Claude connector's entire product surface: pitch, connector
// URL, three setup steps. Doubles as the marketing page (the link that goes in
// a tweet or the claim email), so it reads editorial, not developer-docs.
// The connector itself is app/api/mcp, served at /mcp via rewrite.

const CONNECTOR_URL = 'https://www.yourbulletin.com/mcp'

export const metadata: Metadata = {
  title: 'Bulletin × Claude',
  description:
    'Connect Bulletin to Claude: every link you save becomes context your AI can draw on.',
}

const STEPS: [string, React.ReactNode][] = [
  ['01', <>In Claude, open <strong className="font-[600] text-ink">Settings → Connectors</strong>.</>],
  ['02', <>Add a custom connector and paste the URL above.</>],
  ['03', <>Done. Ask Claude about anything you&rsquo;ve saved.</>],
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

        {/* Connector URL */}
        <div className="mt-14">
          <div className="mb-3 font-sans text-[12px] font-[600] uppercase tracking-[0.14em] text-black/40">
            Connector URL
          </div>
          <CopyConnectorUrl url={CONNECTOR_URL} />
        </div>

        {/* Setup steps */}
        <ol className="mt-12 space-y-6">
          {STEPS.map(([n, body]) => (
            <li key={n} className="flex items-baseline gap-5">
              <span className="shrink-0 font-sans text-[13px] font-[600] tracking-[0.08em] text-black/35">
                {n}
              </span>
              <span className="font-serif text-[17px] leading-[1.5] text-black/70">{body}</span>
            </li>
          ))}
        </ol>

        {/* Footnote-weight mentions, not sections. */}
        <p className="mt-14 border-t border-black/[0.06] pt-6 font-serif text-[14px] leading-[1.6] text-black/40">
          Works for any published list too&thinsp;&mdash;&thinsp;connect a
          curator you follow and Claude can read their picks. Read-only: Claude
          can&rsquo;t save, edit or delete anything.
        </p>
      </div>

      <SiteFooter widthClassName="max-w-2xl px-6 sm:px-8" />
    </main>
  )
}
