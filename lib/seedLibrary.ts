// Onboarding seed library.
//
// A hand-picked slice of our harvest (scripts/harvest/out/rejudged.json) so a
// brand-new page isn't empty. Onboarding now asks for INTERESTS first, then
// shows the seed links that match — the user picks 3, which become real
// bookmarks (metadata + embed + screenshot) via /api/onboarding/setup.
//
// Two orthogonal axes per link:
//   • `type`      — the card FORMAT (tool/essay/product/…). Drives the picker
//                   thumbnail colour and the templated starter-list name.
//   • `interests` — the TOPICS it belongs to. Drives the interests-first filter.
//                   One link can span several (a design tool is design + tech).
//
// Curated for recognisability and spread: 15 links per interest, so a 3-interest
// pick lands on ~45 cards. Preview images are baked into Supabase Storage keyed
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

export type Interest =
  | 'style'
  | 'shopping'
  | 'food'
  | 'travel'
  | 'culture'
  | 'startups'
  | 'design'
  | 'tech'

export interface SeedLink {
  title: string
  url: string
  domain: string
  type: SeedType
  interests: Interest[]
}

// Interest taxonomy — lifestyle-forward, matching where the harvest is deep.
// Order = display order in the onboarding chip grid.
export const INTERESTS: { key: Interest; label: string }[] = [
  { key: 'style', label: 'Style & fashion' },
  { key: 'shopping', label: 'Shopping & brands' },
  { key: 'food', label: 'Food & drink' },
  { key: 'travel', label: 'Travel & places' },
  { key: 'culture', label: 'Culture & ideas' },
  { key: 'startups', label: 'Startups & business' },
  { key: 'design', label: 'Design' },
  { key: 'tech', label: 'Tech & AI' },
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
  { title: "Norbulingka — handmade Tibetan garments", url: 'https://norbulingka.org', domain: 'norbulingka.org', type: 'brand', interests: ['style'] },
  { title: "Cool & Vintage — restored classic Land Rovers", url: 'https://coolnvintage.com', domain: 'coolnvintage.com', type: 'brand', interests: ['style'] },
  { title: "Paynter — small-batch jackets, in drops", url: 'https://paynter.co.uk', domain: 'paynter.co.uk', type: 'brand', interests: ['style'] },
  { title: "Yearly Co. — story-driven fine jewelry", url: 'https://yearlyco.com', domain: 'yearlyco.com', type: 'brand', interests: ['style'] },
  { title: "Danny D's Mud Shop — an LA pottery studio", url: 'https://dannydsmudshop.com', domain: 'dannydsmudshop.com', type: 'brand', interests: ['style'] },
  { title: "Best Made Co. — heritage design goods", url: 'https://bestmadeco.com', domain: 'bestmadeco.com', type: 'brand', interests: ['style'] },
  { title: "SLOWE — modular furniture from London", url: 'https://sloweliving.com', domain: 'sloweliving.com', type: 'brand', interests: ['style', 'design'] },
  { title: "Nagnata — technical knitwear", url: 'https://nagnata.com', domain: 'nagnata.com', type: 'brand', interests: ['style'] },
  { title: "Observe — an independent design studio", url: 'https://observegallery.com', domain: 'observegallery.com', type: 'brand', interests: ['style', 'design'] },
  { title: "Rahasya — niche botanical perfume", url: 'https://rahasyafragrances.com', domain: 'rahasyafragrances.com', type: 'brand', interests: ['style'] },
  { title: "Albam — founder-led British clothing", url: 'https://albamclothing.com', domain: 'albamclothing.com', type: 'brand', interests: ['style'] },
  { title: "Drake's — London menswear & tailoring", url: 'https://drakes.com', domain: 'drakes.com', type: 'brand', interests: ['style'] },
  { title: "COMOCO — Black-grown, undyed cotton", url: 'https://comococotton.com', domain: 'comococotton.com', type: 'brand', interests: ['style'] },
  { title: "Block Shop — hand-block-printed textiles", url: 'https://blockshoptextiles.com', domain: 'blockshoptextiles.com', type: 'brand', interests: ['style', 'design'] },
  { title: "Sézane — Parisian everyday classics", url: 'https://sezane.com', domain: 'sezane.com', type: 'brand', interests: ['style'] },

  // ── shopping ──
  { title: "HAY — modern furniture & objects", url: 'https://us.hay.com', domain: 'us.hay.com', type: 'brand', interests: ['shopping', 'design'] },
  { title: "Lindsey Adelman — sculptural lighting", url: 'https://lindseyadelman.com', domain: 'lindseyadelman.com', type: 'brand', interests: ['shopping', 'design'] },
  { title: "Noguchi — the Akari light sculptures", url: 'https://shop.noguchi.org', domain: 'shop.noguchi.org', type: 'product', interests: ['shopping', 'design'] },
  { title: "Areaware — playful design objects", url: 'https://areaware.com', domain: 'areaware.com', type: 'brand', interests: ['shopping', 'design'] },
  { title: "Outlier — technical everyday apparel", url: 'https://outlier.nyc', domain: 'outlier.nyc', type: 'brand', interests: ['shopping', 'style'] },
  { title: "Bastet Ritual — POV-driven skincare", url: 'https://bastetritual.com', domain: 'bastetritual.com', type: 'brand', interests: ['shopping'] },
  { title: "Ishinomaki Lab — DIY-spirit Japanese furniture", url: 'https://ishinomaki-lab.org', domain: 'ishinomaki-lab.org', type: 'brand', interests: ['shopping', 'design'] },
  { title: "Nomia — sculptural fine jewelry", url: 'https://nomia-nyc.com', domain: 'nomia-nyc.com', type: 'product', interests: ['shopping', 'style'] },
  { title: "Female Hysteria — curated vintage", url: 'https://femalehysteriavintage.com', domain: 'femalehysteriavintage.com', type: 'brand', interests: ['shopping', 'style'] },
  { title: "Cashfana — Italian ceramic jewelry", url: 'https://cashfana.com', domain: 'cashfana.com', type: 'brand', interests: ['shopping', 'style'] },
  { title: "Baggu — the reusable bag, done right", url: 'https://baggu.com', domain: 'baggu.com', type: 'brand', interests: ['shopping'] },
  { title: "Gurkee's — handmade rope sandals", url: 'https://gurkees.com', domain: 'gurkees.com', type: 'brand', interests: ['shopping'] },
  { title: "Ann Torian — miniature artisan works", url: 'https://miniatureanntorian.com', domain: 'miniatureanntorian.com', type: 'brand', interests: ['shopping'] },
  { title: "Hygge & West — design-forward wallpaper", url: 'https://hyggeandwest.com', domain: 'hyggeandwest.com', type: 'brand', interests: ['shopping', 'design'] },
  { title: "Auzi — hearing aids that double as jewelry", url: 'https://myauzi.com', domain: 'myauzi.com', type: 'product', interests: ['shopping'] },

  // ── food ──
  { title: "Since — non-alcoholic spirits", url: 'https://sincespirits.com', domain: 'sincespirits.com', type: 'brand', interests: ['food'] },
  { title: "Bidii Baby Foods — Indigenous-led", url: 'https://bidiibabyfoods.org', domain: 'bidiibabyfoods.org', type: 'brand', interests: ['food'] },
  { title: "Heyday — playful tinned beans", url: 'https://heydaycanning.com', domain: 'heydaycanning.com', type: 'brand', interests: ['food'] },
  { title: "immi — better-for-you instant ramen", url: 'https://shop.immieats.com', domain: 'shop.immieats.com', type: 'product', interests: ['food'] },
  { title: "Maui Nui — wild-harvested venison", url: 'https://mauinuivenison.com', domain: 'mauinuivenison.com', type: 'product', interests: ['food'] },
  { title: "Leon & Son — choose-your-own cocktail kits", url: 'https://leonandsonwine.com', domain: 'leonandsonwine.com', type: 'product', interests: ['food'] },
  { title: "Tampopo (1985) — the ramen western", url: 'https://metrograph.com/film/?vista_film_id=9999002885', domain: 'metrograph.com', type: 'video', interests: ['food', 'culture'] },
  { title: "Spindrift — real fruit, real fizz", url: 'https://drinkspindrift.com', domain: 'drinkspindrift.com', type: 'brand', interests: ['food'] },
  { title: "Graza — olive oil in a squeeze bottle", url: 'https://graza.co', domain: 'graza.co', type: 'brand', interests: ['food'] },
  { title: "Omsom — punchy Asian pantry starters", url: 'https://omsom.com', domain: 'omsom.com', type: 'brand', interests: ['food'] },
  { title: "Brightland — California olive oil", url: 'https://brightland.com', domain: 'brightland.com', type: 'brand', interests: ['food'] },
  { title: "Fishwife — ethically-sourced tinned fish", url: 'https://fishwife.com', domain: 'fishwife.com', type: 'brand', interests: ['food'] },
  { title: "Ghia — a non-alcoholic aperitif", url: 'https://ghia.com', domain: 'ghia.com', type: 'brand', interests: ['food'] },
  { title: "Diaspora Co. — single-origin spices", url: 'https://diasporaco.com', domain: 'diasporaco.com', type: 'brand', interests: ['food'] },
  { title: "Partake — allergy-friendly cookies", url: 'https://partakefoods.com', domain: 'partakefoods.com', type: 'brand', interests: ['food'] },

  // ── travel ──
  { title: "The Madonna Inn", url: 'https://madonnainn.com', domain: 'madonnainn.com', type: 'place', interests: ['travel'] },
  { title: "The Paul Rudolph Institute", url: 'https://paulrudolph.institute', domain: 'paulrudolph.institute', type: 'place', interests: ['travel'] },
  { title: "Little Island — a lighthouse hotel", url: 'https://littleislandlighthouse.com', domain: 'littleislandlighthouse.com', type: 'place', interests: ['travel'] },
  { title: "Casa de Chá da Boa Nova — Siza on the sea", url: 'https://casadechadaboanova.pt', domain: 'casadechadaboanova.pt', type: 'place', interests: ['travel'] },
  { title: "Almeja — a Porto restaurant with intent", url: 'https://almejaporto.com', domain: 'almejaporto.com', type: 'place', interests: ['travel', 'food'] },
  { title: "SCAR-ID — a Porto concept store", url: 'https://scar-id.com', domain: 'scar-id.com', type: 'place', interests: ['travel', 'style'] },
  { title: "Ock Pop Tok — a Laos textile enterprise", url: 'https://ockpoptok.com', domain: 'ockpoptok.com', type: 'place', interests: ['travel'] },
  { title: "The Locavore Variety Store", url: 'https://thelocavore.com', domain: 'thelocavore.com', type: 'place', interests: ['travel'] },
  { title: "Spartan — a Portland design showroom", url: 'https://spartan-shop.com', domain: 'spartan-shop.com', type: 'place', interests: ['travel', 'design'] },
  { title: "Convento do Espinheiro — a restored convent", url: 'https://conventodoespinheiro.com', domain: 'conventodoespinheiro.com', type: 'place', interests: ['travel'] },
  { title: "Ace Hotel", url: 'https://acehotel.com', domain: 'acehotel.com', type: 'place', interests: ['travel'] },
  { title: "Deetjen's Big Sur Inn", url: 'https://deetjens.org', domain: 'deetjens.org', type: 'place', interests: ['travel'] },
  { title: "Chateau Marmont", url: 'https://chateaumarmont.com', domain: 'chateaumarmont.com', type: 'place', interests: ['travel'] },
  { title: "Maçakızı — a Bodrum boutique hotel", url: 'https://macakizi.com', domain: 'macakizi.com', type: 'place', interests: ['travel'] },
  { title: "Tribeca Synagogue — a modernist landmark", url: 'https://tribecasynagogue.org', domain: 'tribecasynagogue.org', type: 'place', interests: ['travel', 'design'] },

  // ── culture ──
  { title: "On the Phenomenon of Bullshit Jobs", url: 'https://strikemag.org/bullshit-jobs', domain: 'strikemag.org', type: 'essay', interests: ['culture'] },
  { title: "Meditations on Moloch — Scott Alexander", url: 'https://slatestarcodex.com/2014/07/30/meditations-on-moloch/', domain: 'slatestarcodex.com', type: 'essay', interests: ['culture'] },
  { title: "The Mind in the Wheel", url: 'https://slimemoldtimemold.com/2025/02/06/the-mind-in-the-wheel-prologue-everybody-wants-a-rock', domain: 'slimemoldtimemold.com', type: 'article', interests: ['culture'] },
  { title: "The Paris Review — the art of the interview", url: 'https://www.theparisreview.org/interviews', domain: 'theparisreview.org', type: 'article', interests: ['culture'] },
  { title: "Sick Woman Theory", url: 'https://topicalcream.org/features/sick-woman-theory', domain: 'topicalcream.org', type: 'essay', interests: ['culture'] },
  { title: "A challenge to the placebo orthodoxy", url: 'https://carcinisation.com/2024/11/13/a-case-against-the-placebo-effect', domain: 'carcinisation.com', type: 'article', interests: ['culture'] },
  { title: "NTS Radio — a show worth following", url: 'https://nts.live/shows/early-bird-show-maria-somerville/episodes/early-bird-show-maria-somerville-16th-december-2025', domain: 'nts.live', type: 'video', interests: ['culture'] },
  { title: "Susan Orlean on the craft of writing", url: 'https://totei.com/story/susan-orlean-interview-technique', domain: 'totei.com', type: 'article', interests: ['culture'] },
  { title: "The Cut — on the economy of NYC nannies", url: 'https://thecut.com/article/nyc-nannies-are-fed-up.html', domain: 'thecut.com', type: 'article', interests: ['culture'] },
  { title: "Literary Hub — books, ideas & essays", url: 'https://lithub.com', domain: 'lithub.com', type: 'article', interests: ['culture'] },
  { title: "Glossy — the inside story of Glossier", url: 'https://bookshop.org/p/books/glossy-ambition-beauty-and-the-inside-story-of-emily-weiss-s-glossier/18860199', domain: 'bookshop.org', type: 'book', interests: ['culture', 'startups'] },
  { title: "An investigation into corporate malfeasance", url: 'https://theurgetohelp.com/articles/formula-for-death', domain: 'theurgetohelp.com', type: 'article', interests: ['culture'] },
  { title: "The Myth of Normal — Gabor Maté", url: 'https://drgabormate.com/book/the-myth-of-normal', domain: 'drgabormate.com', type: 'book', interests: ['culture'] },
  { title: "Fuchsia Dunlop on the food of Sichuan", url: 'https://ft.com/content/bc88bff5-fd7f-4d59-a367-756acbe108b8', domain: 'ft.com', type: 'article', interests: ['culture', 'food'] },
  { title: "GQ — on the ethics of speculative sport", url: 'https://gq.com/story/enhanced-games-olympics-athletes', domain: 'gq.com', type: 'article', interests: ['culture'] },

  // ── startups ──
  { title: "Positional Scarcity — Alex Danco", url: 'https://alexdanco.com/2019/09/07/positional-scarcity', domain: 'alexdanco.com', type: 'essay', interests: ['startups'] },
  { title: "Strategy Letter V — Joel Spolsky", url: 'https://joelonsoftware.com/2002/06/12/strategy-letter-v', domain: 'joelonsoftware.com', type: 'article', interests: ['startups'] },
  { title: "The Conservation of Attractive Profits", url: 'https://stratechery.com/2015/netflix-and-the-conservation-of-attractive-profits', domain: 'stratechery.com', type: 'article', interests: ['startups'] },
  { title: "How to Raise Money — Paul Graham", url: 'https://paulgraham.com/fundraising.html', domain: 'paulgraham.com', type: 'article', interests: ['startups'] },
  { title: "The Almanack of Naval Ravikant", url: 'https://navalmanack.com', domain: 'navalmanack.com', type: 'book', interests: ['startups'] },
  { title: "Not Boring — Packy McCormick on tech", url: 'https://notboring.co', domain: 'notboring.co', type: 'article', interests: ['startups'] },
  { title: "Planes, Claims and Automobiles", url: 'https://worksinprogress.co/issue/planes-claims-and-automobiles', domain: 'worksinprogress.co', type: 'article', interests: ['startups'] },
  { title: "On reindustrialization", url: 'https://austinvernon.site/blog/manufacturing.html', domain: 'austinvernon.site', type: 'essay', interests: ['startups'] },
  { title: "Acquired — the NVIDIA episode", url: 'https://acquired.fm/episodes/nvidia-the-gpu-company-1993-2006', domain: 'acquired.fm', type: 'video', interests: ['startups'] },
  { title: "What happened to the future?", url: 'https://foundersfund.com/2023/06/choose-good-quests', domain: 'foundersfund.com', type: 'article', interests: ['startups'] },
  { title: "On the new American fatherhood", url: 'https://derekthompson.org/p/why-do-richer-dads-spend-more-time', domain: 'derekthompson.org', type: 'essay', interests: ['startups'] },
  { title: "First Round Review — hard-won startup advice", url: 'https://review.firstround.com', domain: 'review.firstround.com', type: 'article', interests: ['startups'] },
  { title: "The art dealer who cornered a market", url: 'https://newyorker.com/magazine/1951/09/29/the-days-of-duveen', domain: 'newyorker.com', type: 'article', interests: ['startups'] },
  { title: "Stripe — the payments infrastructure", url: 'https://stripe.com', domain: 'stripe.com', type: 'brand', interests: ['startups'] },
  { title: "Lenny — on building product", url: 'https://lennysnewsletter.com', domain: 'lennysnewsletter.com', type: 'article', interests: ['startups'] },

  // ── design ──
  { title: "Type.lol — an indie type-foundry directory", url: 'https://type.lol', domain: 'type.lol', type: 'tool', interests: ['design'] },
  { title: "Mobbin — real-world UI reference", url: 'https://mobbin.com', domain: 'mobbin.com', type: 'tool', interests: ['design', 'tech'] },
  { title: "Practical Lettering — the craft of lettering", url: 'https://practicallettering.com', domain: 'practicallettering.com', type: 'tool', interests: ['design'] },
  { title: "Eyecandy — a visual technique library", url: 'https://eyecannndy.com', domain: 'eyecannndy.com', type: 'tool', interests: ['design'] },
  { title: "Sight Unseen — on independent design", url: 'https://www.sightunseen.com', domain: 'sightunseen.com', type: 'article', interests: ['design'] },
  { title: "The Design Files — interiors & design", url: 'https://thedesignfiles.net', domain: 'thedesignfiles.net', type: 'article', interests: ['design'] },
  { title: "designboom — design journalism", url: 'https://www.designboom.com', domain: 'designboom.com', type: 'article', interests: ['design'] },
  { title: "Milk — glossy interiors", url: 'https://www.milkdecoration.com', domain: 'milkdecoration.com', type: 'article', interests: ['design'] },
  { title: "Are.na — a quieter place to collect", url: 'https://are.na', domain: 'are.na', type: 'tool', interests: ['design', 'tech'] },
  { title: "Dezeen — architecture & design news", url: 'https://www.dezeen.com', domain: 'dezeen.com', type: 'article', interests: ['design'] },
  { title: "Core77 — the industrial-design daily", url: 'https://www.core77.com', domain: 'core77.com', type: 'article', interests: ['design'] },
  { title: "Fonts In Use — typography in the wild", url: 'https://fontsinuse.com', domain: 'fontsinuse.com', type: 'tool', interests: ['design'] },
  { title: "It’s Nice That — creative inspiration", url: 'https://www.itsnicethat.com', domain: 'itsnicethat.com', type: 'article', interests: ['design'] },
  { title: "Colossal — art & visual culture", url: 'https://www.thisiscolossal.com', domain: 'thisiscolossal.com', type: 'article', interests: ['design'] },
  { title: "Cereal — a travel & style magazine", url: 'https://readcereal.com', domain: 'cerealmag.com', type: 'article', interests: ['design', 'travel'] },

  // ── tech ──
  { title: "Thingtesting — reviews of new DTC brands", url: 'https://thingtesting.com', domain: 'thingtesting.com', type: 'tool', interests: ['tech', 'shopping'] },
  { title: "Americans Only — on the AI boundary", url: 'https://lucumr.pocoo.org/2026/6/13/americans-only', domain: 'lucumr.pocoo.org', type: 'essay', interests: ['tech'] },
  { title: "Ghostty Is Leaving GitHub", url: 'https://mitchellh.com/writing/ghostty-leaving-github', domain: 'mitchellh.com', type: 'essay', interests: ['tech'] },
  { title: "Low-Tech Magazine — the solar-powered site", url: 'https://solar.lowtechmagazine.com', domain: 'solar.lowtechmagazine.com', type: 'tool', interests: ['tech'] },
  { title: "Howie — an AI scheduling assistant", url: 'https://howie.ai', domain: 'howie.ai', type: 'tool', interests: ['tech'] },
  { title: "Web UI Bench — 20 models build one UI", url: 'https://webuibench.dev', domain: 'webuibench.dev', type: 'tool', interests: ['tech', 'design'] },
  { title: "Factory — agent-native software development", url: 'https://factory.ai', domain: 'factory.ai', type: 'tool', interests: ['tech'] },
  { title: "Mainframe — recap your work as video", url: 'https://mainframe.app', domain: 'mainframe.app', type: 'tool', interests: ['tech'] },
  { title: "Here — an independent site builder", url: 'https://here.now', domain: 'here.now', type: 'tool', interests: ['tech'] },
  { title: "Linear — issue tracking, done right", url: 'https://linear.app', domain: 'linear.app', type: 'tool', interests: ['tech'] },
  { title: "Raycast — a faster way to your Mac", url: 'https://raycast.com', domain: 'raycast.com', type: 'tool', interests: ['tech'] },
  { title: "Arc — a browser that gets out of the way", url: 'https://arc.net', domain: 'arc.net', type: 'tool', interests: ['tech'] },
  { title: "Val Town — code you can run in a click", url: 'https://val.town', domain: 'val.town', type: 'tool', interests: ['tech'] },
  { title: "Obsidian — a home for your notes", url: 'https://obsidian.md', domain: 'obsidian.md', type: 'tool', interests: ['tech'] },
  { title: "Bear — writing that feels good", url: 'https://bear.app', domain: 'bear.app', type: 'tool', interests: ['tech'] },
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
