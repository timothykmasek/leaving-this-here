// Onboarding seed library.
//
// A small, hand-picked slice of our harvest (scripts/harvest/out/rejudged.json)
// so a brand-new page isn't empty: the user picks 3 of these during onboarding
// and they become real bookmarks (metadata + embed + screenshot) via
// /api/onboarding/setup. Curated for recognizability and spread across
// categories — swap freely. There are no images in the harvest, so the picker
// renders each as a category-coloured block (title + domain), mirroring the
// Claude Design mock; the real card image is fetched when the pick is saved.

export type SeedType =
  | 'tool'
  | 'essay'
  | 'article'
  | 'product'
  | 'brand'
  | 'place'
  | 'video'
  | 'book'

export interface SeedLink {
  title: string
  url: string
  domain: string
  type: SeedType
}

// Per-category styling for the picker thumbnail + the templated starter-list
// name (lists are about WHY you saved, not the topic — see the lists overhaul).
export const CATEGORY: Record<SeedType, { bg: string; fg: string; listName: string }> = {
  tool: { bg: '#e7eaf2', fg: '#26314f', listName: 'Tools I keep open' },
  essay: { bg: '#efe9df', fg: '#2a2419', listName: 'Worth reading twice' },
  article: { bg: '#e4efe6', fg: '#244a2e', listName: 'Long reads' },
  product: { bg: '#f1e3d8', fg: '#5a2f1e', listName: 'Things worth buying' },
  brand: { bg: '#dfe7df', fg: '#22402a', listName: 'Brands done right' },
  place: { bg: '#e6e4d8', fg: '#3a3a26', listName: 'Places to go' },
  video: { bg: '#1a1a1a', fg: '#f4d35e', listName: 'Watch later' },
  book: { bg: '#e9e2f0', fg: '#3a2a55', listName: 'On my shelf' },
}

export const SEED_LIBRARY: SeedLink[] = [
  // ── tools ──
  { title: 'Eyecandy — a visual technique library', url: 'https://eyecannndy.com/', domain: 'eyecannndy.com', type: 'tool' },
  { title: 'Web UI Bench — 20 models build the same UI', url: 'https://webuibench.dev/', domain: 'webuibench.dev', type: 'tool' },
  { title: 'Factory — agent-native software development', url: 'https://factory.ai/', domain: 'factory.ai', type: 'tool' },

  // ── essays ──
  { title: 'Americans Only — on the AI boundary', url: 'https://lucumr.pocoo.org/2026/6/13/americans-only', domain: 'lucumr.pocoo.org', type: 'essay' },
  { title: 'On the Phenomenon of Bullshit Jobs', url: 'https://strikemag.org/bullshit-jobs', domain: 'strikemag.org', type: 'essay' },
  { title: 'Ghostty Is Leaving GitHub', url: 'https://mitchellh.com/writing/ghostty-leaving-github', domain: 'mitchellh.com', type: 'essay' },
  { title: 'On the AI Exponential', url: 'https://darioamodei.com/post/policy-on-the-ai-exponential', domain: 'darioamodei.com', type: 'essay' },

  // ── articles ──
  { title: 'The Mind in the Wheel', url: 'https://slimemoldtimemold.com/2025/02/06/the-mind-in-the-wheel-prologue-everybody-wants-a-rock', domain: 'slimemoldtimemold.com', type: 'article' },
  { title: 'Dating Men in the Bay Area', url: 'https://astralcodexten.com/p/your-review-dating-men-in-the-bay', domain: 'astralcodexten.com', type: 'article' },
  { title: 'The Café Upending Capitalism', url: 'https://yesmagazine.org/issue/work/2022/08/16/cafe-upending-capitalism', domain: 'yesmagazine.org', type: 'article' },

  // ── products ──
  { title: 'Maui Nui — wild-harvested venison', url: 'https://mauinuivenison.com/', domain: 'mauinuivenison.com', type: 'product' },
  { title: 'Carv — the digital ski coach', url: 'https://getcarv.com/', domain: 'getcarv.com', type: 'product' },
  { title: 'Auzi — hearing aids that double as jewelry', url: 'https://myauzi.com/', domain: 'myauzi.com', type: 'product' },
  { title: 'Leon & Son — choose-your-own cocktail kits', url: 'https://leonandsonwine.com/', domain: 'leonandsonwine.com', type: 'product' },

  // ── brands ──
  { title: 'Spindrift — real fruit, real fizz', url: 'https://drinkspindrift.com/', domain: 'drinkspindrift.com', type: 'brand' },
  { title: 'SLOWE Living', url: 'https://sloweliving.com/', domain: 'sloweliving.com', type: 'brand' },
  { title: 'COMOCO — Black-grown, undyed cotton', url: 'https://comococotton.com/', domain: 'comococotton.com', type: 'brand' },
  { title: 'Paynter — small-batch jackets', url: 'https://paynter.co.uk/', domain: 'paynter.co.uk', type: 'brand' },

  // ── places ──
  { title: "Deetjen's Big Sur Inn", url: 'https://deetjens.org/', domain: 'deetjens.org', type: 'place' },
  { title: 'The Madonna Inn', url: 'https://madonnainn.com/', domain: 'madonnainn.com', type: 'place' },
  { title: 'Chateau Marmont', url: 'https://chateaumarmont.com/', domain: 'chateaumarmont.com', type: 'place' },
  { title: 'Chicago Athletic Association', url: 'https://chicagoathletichotel.com/', domain: 'chicagoathletichotel.com', type: 'place' },

  // ── watch / read ──
  { title: 'Tampopo (1985) at Metrograph', url: 'https://metrograph.com/film/?vista_film_id=9999002885', domain: 'metrograph.com', type: 'video' },
  { title: 'Glossy — the inside story of Glossier', url: 'https://bookshop.org/p/books/glossy-ambition-beauty-and-the-inside-story-of-emily-weiss-s-glossier/18860199', domain: 'bookshop.org', type: 'book' },
]

// Picker preview image — the screenshot we baked once into Supabase Storage
// under a stable `seed/<domain>.webp` key (see the bake script). Derived from
// the public storage path so we don't hardcode 24 long URLs.
export function seedImageUrl(seed: SeedLink): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return `${base}/storage/v1/object/public/card-images/seed/${seed.domain}.webp`
}
