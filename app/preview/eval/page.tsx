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
  { category: 'WSJ', url: 'https://wsj.com/articles/wait-are-hearing-aids-cool-now-ask-millennials-629e7e55', predict: 'paywall — og?' },
  { category: 'Bandcamp', url: 'https://thursdaynjhc.bandcamp.com', predict: 'album art (no oembed)' },
  { category: 'Pinterest', url: 'https://kr.pinterest.com/pin/inside-a-70sstyle-river-island-home-outside-portland-oregon--286541595037222151', predict: 'pin image or block' },
  { category: 'Gap', url: 'https://gap.com/browse/product.do?pid=883546022&cid=1041168&pcid=1041168&vid=1', predict: 'product og?' },
  { category: 'NYT Cooking', url: 'https://cooking.nytimes.com/recipes/1022710-cilantro-date-chutney', predict: 'recipe photo og' },
  { category: 'YT Shorts', url: 'https://m.youtube.com/shorts/ngqYBt8lPYs', predict: 'oembed (m. host)' },
  { category: 'Notion', url: 'https://dolightwork.notion.site/Lightwork-Home-report-Mares-Residence-public-5b5a938b26db4b11841b70da4cbb2f28', predict: 'og or screenshot' },
  { category: 'Figma blog', url: 'https://figma.com/blog/the-figma-agent-is-here', predict: 'article og' },
  { category: 'OpenAI', url: 'https://openai.com/index/model-disproves-discrete-geometry-conjecture', predict: 'article og' },
  { category: 'NYMag tag', url: 'https://nymag.com/tags/summer-of-scam', predict: 'tag page — maybe logo' },
  { category: 'Spotify list', url: 'https://open.spotify.com/playlist/7eCUIW4i1hXGMCFBeMy6Ug', predict: 'oembed cover' },
  { category: 'Apple Music', url: 'https://music.apple.com/us/playlist/herb-sundays-187-the-field/pl.u-dE1BZCeoN0A', predict: 'og art' },
  { category: 'Google Doc', url: 'https://docs.google.com/document/d/1SWJw_NTyUvgdB_asRzsnVyKjciW8dZbeqQeUeWsEiQc/edit', predict: 'auth wall — may blank' },
  { category: 'Bookshop', url: 'https://bookshop.org/p/books/glossy-ambition-beauty-and-the-inside-story-of-emily-weiss-s-glossier/18860199', predict: 'book cover' },
  { category: 'The Verge', url: 'https://theverge.com/2020/11/16/21570454/lil-nas-x-roblox-concert-33-million-views', predict: 'article og' },
  { category: 'Medium', url: 'https://medium.com/swlh/what-i-know-about-community-building-939aeac0aa7', predict: 'article og' },
  { category: 'Vogue', url: 'https://vogue.com/fashion-shows/spring-2026-ready-to-wear/chloe/slideshow/collection', predict: 'runway og' },
  { category: 'Bloomberg', url: 'https://bloomberg.com/news/articles/2026-02-06/jennifer-garner-s-once-upon-a-farm-rises-17-after-198-million-ipo', predict: 'heavy bot-block' },
  { category: 'ProductHunt', url: 'https://producthunt.com/products/granite', predict: 'og card' },
  { category: 'Newsletter', url: 'https://milkkarten.net/p/your-approval-process-is-ruining', predict: 'custom-domain substack og' },
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

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 [perspective:2400px] sm:grid-cols-3 lg:grid-cols-4">
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
