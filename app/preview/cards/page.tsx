import { PrimaryCard } from '@/components/PrimaryCard'
import { BracketLabel } from '@/components/BulletinHeader'
import { resolveCategory } from '@/lib/cardFormat'

// Ship 02 scratchpad — the shared DS "Primary Card" primitive rendered against
// REAL Bulletin bullets (fetched 2026-08-14, one/two per live card_type). This
// page is not linked anywhere; it exists to feel the card + its per-type mask
// aspects before anything touches the live grid. Delete when Ship 02 lands.

const SAMPLES: any[] = [
  { card_type: 'article', url: 'https://bento.me/en/home', title: 'Link in bio tool: Everything you are, in one simple link | Linktree', image_url: 'https://cdn.prod.website-files.com/666255f7f2126f4e8cec6f8f/66a8993e0e8d98b8822b7c50_Linktree-OpenGraphPreview.jpg', screenshot_url: null, favicon_url: 'https://cdn.prod.website-files.com/666255f7f2126f4e8cec6f8f/66693601ff7950e64e66b56b_favicon.png', list: 'Portfolio Tools' },
  { card_type: 'article', url: 'https://www.samsara.com/uk/', title: 'Samsara: The leading fleet management and safety platform', image_url: 'https://images.ctfassets.net/bx9krvy0u3sx/7cxFtCvfGbzKg8s56mzITz/7131f933583277365836fa7697d196e1/Og-Image_Homepage-US-UK-CA-en.png', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'product', url: 'https://www.myhabits.io/', title: 'MyHabits.io — Google Sheets Template', image_url: 'https://myhabits.io/og-image.png', screenshot_url: null, favicon_url: null, list: 'Habit Systems' },
  { card_type: 'product', url: 'https://www.mentorpass.co/me/thomaslalas', title: '1:1 Consulting with Thomas Lalas', image_url: 'https://cdn.filestackcontent.com/uWZ8ofMpSxSKArzd5JKq', screenshot_url: null, favicon_url: 'https://www.mentorpass.co/favicon.ico', list: null },
  { card_type: 'composite', url: 'https://www.linkedin.com/pulse/40-things', title: '40 Things I Had to Unlearn—And Lessons I Actually Learned', image_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/og/cd0ef8a6-adbe-4460-b4cd-b9ff277ed031.jpg', screenshot_url: null, favicon_url: 'https://static.licdn.com/aero-v1/sc/h/al2o9zrvru7aqj8e1x2rzsrca', list: 'Founder Lessons' },
  { card_type: 'fullbleed', url: 'https://graphpaper-tokyo.com/collections/mens', title: 'Graphpaper official site', image_url: 'https://cdn.shopify.com/s/files/1/0614/6231/5221/files/Graphpaper_OG_24bfd3f9-27f7-412f-8eee-9a81e55df789.jpg?v=1643957040', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'fullbleed', url: 'https://thesleepcode.com/products/serotonin-bath-soak-salt', title: 'Serotonin Bath Soak Salt', image_url: 'http://thesleepcode.com/cdn/shop/files/Serotonin_Bath_Soak_Salt.png?crop=center&height=1200&v=1784575222&width=1200', screenshot_url: null, favicon_url: null, list: 'The Fit Check' },
  { card_type: 'screenshot', url: 'https://www.valarian.com/', title: 'Valarian | Sovereign Intelligence', image_url: 'https://www.valarian.com/assets/og/sharecard-4.png', screenshot_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/7337077b-252b-43c1-983e-2527dee99c9b.webp', favicon_url: null, list: null },
  { card_type: 'screenshot', url: 'https://www.withcoverage.com/', title: 'WithCoverage - The Risk Management Solution For Ambitious Businesses', image_url: 'https://www.withcoverage.com/images/og/withcoverage-social.png', screenshot_url: 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/thumb/14327ffa-073c-4fe2-9bfd-67f6c627bdc0.webp', favicon_url: null, list: 'AI Finance' },
  // Domain-resolved categories (Video/Music/Podcast/Social) — show the new
  // affordances. card_type is deliberately "wrong" (article/screenshot) to prove
  // the URL signal overrides the noisy classifier.
  { card_type: 'article', url: 'https://www.youtube.com/watch?v=PHe0bXAIuk0', title: 'How The Economic Machine Works by Ray Dalio', image_url: 'https://i.ytimg.com/vi/PHe0bXAIuk0/maxresdefault.jpg', screenshot_url: null, favicon_url: null, list: null },
  { card_type: 'screenshot', url: 'https://open.spotify.com/episode/4rOoJ6Egrf8K2IrywzwOMk', title: 'The Tim Ferriss Show — Naval Ravikant', image_url: null, screenshot_url: null, favicon_url: 'https://open.spotifycdn.com/cdn/images/favicon.0f31d2ea.ico', list: 'Deep Listens' },
  { card_type: 'screenshot', url: 'https://open.spotify.com/album/1ATL5GLyefJaxhQzSPVrLX', title: 'Random Access Memories — Daft Punk', image_url: null, screenshot_url: null, favicon_url: null, list: null },
]

export default function CardsPreview() {
  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1208px] px-6 py-16">
        <div className="mb-2">
          <BracketLabel>Ship 02 · Primary Card primitive</BracketLabel>
        </div>
        <h1 className="mb-1 font-serif text-2xl text-ink">Per-type cards — real data</h1>
        <p className="mb-10 max-w-xl font-serif text-sm text-ink/60">
          The shared DS Primary Card rendered against live bullets. Each card&apos;s
          shape comes from its <code>card_type</code> via the provisional
          <code> cardFormat</code> map — the mask-aspect knob is the whole point.
        </p>

        {/* Masonry via CSS columns — cards vary in height by their mask aspect. */}
        <div className="[column-gap:24px] columns-2 sm:columns-3 lg:columns-4">
          {SAMPLES.map((b, i) => (
            <div key={i} className="mb-8 break-inside-avoid">
              <div className="mb-1"><BracketLabel>{b.card_type} → {resolveCategory(b.url, b.card_type).category}</BracketLabel></div>
              <PrimaryCard
                url={b.url}
                title={b.title}
                imageUrl={b.image_url}
                screenshotUrl={b.screenshot_url}
                faviconUrl={b.favicon_url}
                cardType={b.card_type}
                listName={b.list}
              />
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
