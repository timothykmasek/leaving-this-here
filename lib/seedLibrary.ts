// Onboarding seed library.
//
// A hand-picked slice of our harvest (scripts/harvest/out/rejudged.json) so a
// brand-new page isn't empty. Onboarding now asks for INTERESTS first, then
// shows the seed links that match — the user picks 3, which become real
// bookmarks (metadata + embed + screenshot) via /api/onboarding/setup.
//
// Two orthogonal axes per link:
//   • `type`     — the card FORMAT (tool/essay/product/…). Drives the picker
//                  thumbnail colour and the templated starter-list name.
//   • `interest` — the one TOPIC it belongs to. Drives the interests-first
//                  filter. Exactly one per link, so no card shows up under two.
//
// Review and prune the library at /preview/seeds. Preview images are baked into Supabase Storage keyed
// by domain (scripts/bake-seed-images.ts); un-baked/failed domains fall back to
// a category-coloured block in the picker — the real card image is fetched when
// the pick is saved.

export type SeedType =
  | 'tool'
  | 'essay'
  | 'article'
  | 'product'
  | 'brand'
  | 'place'
  | 'video'
  | 'book'

export type Interest = 'style' | 'food' | 'travel' | 'culture' | 'design' | 'tech'

export interface SeedLink {
  title: string
  url: string
  domain: string
  type: SeedType
  interest: Interest
}

// Interest taxonomy — lifestyle-forward, matching where the harvest is deep.
// Order = display order in the onboarding chip grid.
export const INTERESTS: { key: Interest; label: string }[] = [
  { key: 'style', label: 'Style & shopping' },
  { key: 'food', label: 'Food & drink' },
  { key: 'travel', label: 'Travel & places' },
  { key: 'culture', label: 'Culture & ideas' },
  { key: 'design', label: 'Design' },
  { key: 'tech', label: 'Tech & startups' },
]

export const INTEREST_LABEL: Record<Interest, string> = Object.fromEntries(
  INTERESTS.map((i) => [i.key, i.label]),
) as Record<Interest, string>

// Per-format styling for the picker thumbnail + the templated starter-list
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

  // ── style ──
  { title: "Paynter — small-batch jackets, in drops", url: 'https://paynter.co.uk', domain: 'paynter.co.uk', type: 'brand', interest: 'style' },
  { title: "Yearly Co. — story-driven fine jewelry", url: 'https://yearlyco.com', domain: 'yearlyco.com', type: 'brand', interest: 'style' },
  { title: "Best Made Co. — heritage design goods", url: 'https://bestmadeco.com', domain: 'bestmadeco.com', type: 'brand', interest: 'style' },
  { title: "Nagnata — technical knitwear", url: 'https://nagnata.com', domain: 'nagnata.com', type: 'brand', interest: 'style' },
  { title: "Drake's — London menswear & tailoring", url: 'https://drakes.com', domain: 'drakes.com', type: 'brand', interest: 'style' },
  { title: "Bastet Ritual — POV-driven skincare", url: 'https://bastetritual.com', domain: 'bastetritual.com', type: 'brand', interest: 'style' },
  { title: "Gurkee's — handmade rope sandals", url: 'https://gurkees.com', domain: 'gurkees.com', type: 'brand', interest: 'style' },
  { title: "Lola Blankets — the softest throws you’ll own", url: 'https://lolablankets.com/', domain: 'lolablankets.com', type: 'brand', interest: 'style' },
  { title: "Tansan Magnesium — quiet Korean womenswear", url: 'https://tansanmagnesium.kr/', domain: 'tansanmagnesium.kr', type: 'brand', interest: 'style' },
  { title: "Colbo — a New York shop, AW25", url: 'https://shop.colbo.nyc/collections/colbo-aw25', domain: 'shop.colbo.nyc', type: 'brand', interest: 'style' },

  // ── food ──
  { title: "Heyday — playful tinned beans", url: 'https://heydaycanning.com', domain: 'heydaycanning.com', type: 'brand', interest: 'food' },
  { title: "immi — better-for-you instant ramen", url: 'https://shop.immieats.com', domain: 'shop.immieats.com', type: 'product', interest: 'food' },
  { title: "Spindrift — real fruit, real fizz", url: 'https://drinkspindrift.com', domain: 'drinkspindrift.com', type: 'brand', interest: 'food' },
  { title: "Graza — olive oil in a squeeze bottle", url: 'https://graza.co', domain: 'graza.co', type: 'brand', interest: 'food' },
  { title: "Omsom — punchy Asian pantry starters", url: 'https://omsom.com', domain: 'omsom.com', type: 'brand', interest: 'food' },
  { title: "Fishwife — ethically-sourced tinned fish", url: 'https://fishwife.com', domain: 'fishwife.com', type: 'brand', interest: 'food' },
  { title: "Partake — allergy-friendly cookies", url: 'https://partakefoods.com', domain: 'partakefoods.com', type: 'brand', interest: 'food' },
  { title: "Straker's — a London restaurant on Golborne Road", url: 'https://www.strakers.london/', domain: 'strakers.london', type: 'place', interest: 'food' },
  { title: "Feisty — protein soda, no added sugar", url: 'https://feistydrinks.com/', domain: 'feistydrinks.com', type: 'brand', interest: 'food' },
  { title: "PartnerSlate — matching food brands with manufacturers", url: 'https://partnerslate.com/', domain: 'partnerslate.com', type: 'tool', interest: 'food' },

  // ── travel ──
  { title: "Little Island — a lighthouse hotel", url: 'https://littleislandlighthouse.com', domain: 'littleislandlighthouse.com', type: 'place', interest: 'travel' },
  { title: "Casa de Chá da Boa Nova — Siza on the sea", url: 'https://casadechadaboanova.pt', domain: 'casadechadaboanova.pt', type: 'place', interest: 'travel' },
  { title: "Chateau Marmont", url: 'https://chateaumarmont.com', domain: 'chateaumarmont.com', type: 'place', interest: 'travel' },
  { title: "Cereal — a travel & style magazine", url: 'https://readcereal.com', domain: 'cerealmag.com', type: 'article', interest: 'travel' },
  { title: "Spots — hidden restaurants & whispered hotels", url: 'https://www.spotstravel.co/', domain: 'spotstravel.co', type: 'tool', interest: 'travel' },
  { title: "Bounce — luggage storage in 32,000 places", url: 'https://usebounce.com/', domain: 'usebounce.com', type: 'tool', interest: 'travel' },
  { title: "Arbio — vacation rentals, run with AI", url: 'https://www.arbio-group.com/eng/property-management', domain: 'arbio-group.com', type: 'brand', interest: 'travel' },

  // ── culture ──
  { title: "On the Phenomenon of Bullshit Jobs", url: 'https://strikemag.org/bullshit-jobs', domain: 'strikemag.org', type: 'essay', interest: 'culture' },
  { title: "Susan Orlean on the craft of writing", url: 'https://totei.com/story/susan-orlean-interview-technique', domain: 'totei.com', type: 'article', interest: 'culture' },
  { title: "The Cut — on the economy of NYC nannies", url: 'https://thecut.com/article/nyc-nannies-are-fed-up.html', domain: 'thecut.com', type: 'article', interest: 'culture' },
  { title: "Tempo Journal — Dripping Sweat, a running profile", url: 'https://tempojournal.com/article/dripping-sweat', domain: 'tempojournal.com', type: 'article', interest: 'culture' },
  { title: "Express Checkout — the rise of branded fruit", url: 'https://expresscheckout.co/p/the-rise-of-branded-fruit', domain: 'expresscheckout.co', type: 'article', interest: 'culture' },
  { title: "Public Work — a visual search engine for public-domain art", url: 'https://public.work/', domain: 'public.work', type: 'tool', interest: 'culture' },
  { title: "ARCHIV — a system for cataloguing the physical world", url: 'https://www.archiv.systems/', domain: 'archiv.systems', type: 'tool', interest: 'culture' },

  // ── design ──
  { title: "Observe — an independent design studio", url: 'https://observegallery.com', domain: 'observegallery.com', type: 'brand', interest: 'design' },
  { title: "teenage engineering — beautifully made synths & gadgets", url: 'https://teenage.engineering/', domain: 'teenage.engineering', type: 'brand', interest: 'design' },
  { title: "USM — modular furniture, unchanged since 1963", url: 'https://www.usm.com/en-uk', domain: 'usm.com', type: 'brand', interest: 'design' },
  { title: "AUFI — a creative & branding agency", url: 'https://aufi.com/', domain: 'aufi.com', type: 'brand', interest: 'design' },
  { title: "Otherhalf — a studio for Shopify brands", url: 'https://otherhalf.studio/', domain: 'otherhalf.studio', type: 'brand', interest: 'design' },
  { title: "DMCG — the design office of David McGillivray", url: 'https://dmcg.co/', domain: 'dmcg.co', type: 'brand', interest: 'design' },
  { title: "Garnish — a creative agency for food & drink brands", url: 'https://www.garnishstudios.com/', domain: 'garnishstudios.com', type: 'brand', interest: 'design' },

  // ── tech ──
  { title: "Low-Tech Magazine — the solar-powered site", url: 'https://solar.lowtechmagazine.com', domain: 'solar.lowtechmagazine.com', type: 'tool', interest: 'tech' },
  { title: "Howie — an AI scheduling assistant", url: 'https://howie.ai', domain: 'howie.ai', type: 'tool', interest: 'tech' },
  { title: "Factory — agent-native software development", url: 'https://factory.ai', domain: 'factory.ai', type: 'tool', interest: 'tech' },
  { title: "Mainframe — recap your work as video", url: 'https://mainframe.app', domain: 'mainframe.app', type: 'tool', interest: 'tech' },
  { title: "Arc — a browser that gets out of the way", url: 'https://arc.net', domain: 'arc.net', type: 'tool', interest: 'tech' },
  { title: "Y Combinator — where startups begin", url: 'https://www.ycombinator.com/', domain: 'ycombinator.com', type: 'brand', interest: 'tech' },
  { title: "Fauna Robotics — friendly robots for everyone", url: 'https://faunarobotics.com/', domain: 'faunarobotics.com', type: 'brand', interest: 'tech' },
  { title: "21st — UI building blocks for the agentic web", url: 'https://21st.dev/', domain: '21st.dev', type: 'tool', interest: 'tech' },
  { title: "Kiki — a focus app for the easily distracted", url: 'https://www.kiki.computer/', domain: 'kiki.computer', type: 'tool', interest: 'tech' },
  { title: "Lex Fridman Podcast — DHH on the future of programming", url: 'https://open.spotify.com/episode/45lhw2Adbrsw0xSCOgIeg3', domain: 'open.spotify.com', type: 'video', interest: 'tech' },
]

// Picker preview image — the screenshot we baked once into Supabase Storage
// under a stable `seed/<domain>.webp` key (see the bake script). Derived from
// the public storage path so we don't hardcode long URLs. Domains without a
// baked image fall back to a category-coloured block in the picker (the <img>
// onError handler), so a missing bake degrades gracefully.
export function seedImageUrl(seed: SeedLink): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  return `${base}/storage/v1/object/public/card-images/seed/${seed.domain}.webp`
}

// The seed links for the chosen interests, taken in turns (one from each
// interest, then the next from each…) so every pick shows up near the top.
// Filtering in library order let whichever interest the library lists first
// fill the first rows.
export function pickPool(interests: Interest[]): SeedLink[] {
  if (!interests.length) return SEED_LIBRARY
  const queues = interests.map((i) => SEED_LIBRARY.filter((L) => L.interest === i))
  const out: SeedLink[] = []
  for (let n = 0; queues.some((q) => n < q.length); n++)
    for (const q of queues) if (q[n]) out.push(q[n])
  return out
}

export const isInterest = (k: unknown): k is Interest => INTERESTS.some((i) => i.key === k)
