// THROWAWAY card eval — renders real cards for a curated URL set across
// categories, using the production pipeline (extractMetadata + pickCardImage +
// LinkCard). Screenshot-first types get a live screenshotone URL; og-first
// types get the '' sentinel, exactly like production. Not committed; local only.
//
// Visit /preview/eval. Each load re-fetches metadata live.

import { extractMetadata } from '@/lib/metadata'
import { pickCardImage, prefersOgImage } from '@/lib/cardImage'
import { classifyCardType } from '@/lib/cardType'
import { screenshotApiUrl } from '@/lib/screenshot'
import { LinkCard } from '@/components/LinkCard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const EVAL_URLS: { category: string; url: string; predict: string }[] = [
  { category: 'Twitter/X', url: 'https://x.com/brian_lovin/status/2056444390940516409', predict: 'X blocks scrapers — may blank' },
  { category: 'TikTok', url: 'https://tiktok.com/@mickey17/video/7463175035587448106', predict: 'oEmbed should work' },
  { category: 'Vimeo', url: 'https://vimeo.com/720775128', predict: 'oEmbed should work' },
  { category: 'SoundCloud', url: 'https://soundcloud.com/ra-exchange/ra-exchange-558', predict: 'oEmbed should work' },
  { category: 'Apple Podcasts', url: 'https://podcasts.apple.com/us/podcast/the-unconscious/id1538249280?i=1000558720188', predict: 'og art' },
  { category: 'LinkedIn', url: 'https://linkedin.com/posts/chefchadbrauze_after-an-incredible-run-with-the-team-at-share-7473017156713103361-yPv0', predict: 'auth wall — may blank' },
  { category: 'Reddit', url: 'https://reddit.com/r/verticalfarming/comments/1ghpkiv/bowery_farming_to_shut_down_cease_all_operations', predict: 'variable og' },
  { category: 'Goodreads', url: 'https://www.goodreads.com/book/show/43890641-hamnet', predict: 'book cover' },
  { category: 'Etsy', url: 'https://www.etsy.com/listing/4309976881/personalized-initial-ring-birth-flower', predict: 'product photo' },
  { category: '1stDibs', url: 'https://www.1stdibs.com/fashion/accessories/scarves/1980s-psychedelic-floral-design-silk-scarf-jean-patou/id-v_26012362/', predict: 'product vs article' },
]

function titlecaseDomain(url: string): string {
  try {
    return new URL(url).hostname
      .replace(/^www\./, '')
      .split('.')[0]
      .replace(/[-_.]+/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim()
  } catch {
    return url
  }
}

async function buildCard(item: { category: string; url: string; predict: string }) {
  let meta
  try {
    meta = await extractMetadata(item.url)
  } catch {
    meta = null
  }
  const ogFirst = prefersOgImage(item.url)
  // Faithful to production: persist-screenshots skips a screenshot only for
  // og-first content-platform DOMAINS ('' sentinel); everything else gets one.
  const screenshotUrl = ogFirst ? '' : screenshotApiUrl(item.url)
  const ogImage = meta?.image || null
  // card_type is now classified at save and drives image routing.
  const cardType = meta ? classifyCardType(item.url, meta) : null
  const image = pickCardImage(item.url, ogImage, screenshotUrl, cardType)
  const title = meta?.title || titlecaseDomain(item.url)

  let source: string
  if (!image) source = 'NONE → blank card'
  else if (image === ogImage) source = 'og:image'
  else source = 'screenshot'

  return { ...item, title, image, source, hadOg: !!ogImage, ogFirst, cardType, rawTitle: meta?.title || null }
}

export default async function EvalPage() {
  const cards = await Promise.all(EVAL_URLS.map(buildCard))

  return (
    <main className="min-h-screen bg-[#e8e6e1] px-8 py-10">
      <div className="mx-auto max-w-[1200px]">
        <h1 className="mb-1 font-serif text-2xl font-bold text-ink">Card eval — 10 types</h1>
        <p className="mb-8 text-sm text-black/50">
          Real pipeline: extractMetadata · pickCardImage · LinkCard. Live screenshots for
          screenshot-first types, &apos;&apos; sentinel for og-first. Each card shows its image source below.
        </p>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.url} className="flex flex-col">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide text-ink">{c.category}</span>
                <span
                  className={`text-[10px] font-semibold ${
                    c.source === 'screenshot'
                      ? 'text-green-700'
                      : c.source === 'og:image'
                        ? 'text-blue-700'
                        : 'text-red-600'
                  }`}
                >
                  {c.source}
                </span>
              </div>

              <div className="w-full max-w-[240px]">
                <LinkCard url={c.url} title={c.title} image={c.image} />
              </div>

              <div className="mt-2 space-y-0.5 text-[10px] leading-tight text-black/45">
                <div>card_type: <b>{c.cardType ?? '—'}</b> · og:image: {c.hadOg ? 'yes' : 'no'}</div>
                <div>title: {c.rawTitle ? `"${c.rawTitle.slice(0, 50)}"` : '(none → domain)'}</div>
                <div className="text-black/30">predict: {c.predict}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
