// Content for the marketing homepage (design handoff "Bulletin home v3").
//
// The page fetches nothing — every link, caption, count and image below is
// fixed at build time, exactly as the handoff specifies. Imagery lives in
// /public/home and stands in for user-saved pages (og → screenshot → plate).
// URLs come from Tim's Homepage_Info sheet.

export type HeroCard = {
  key: string
  href: string
  caption: string
  image: string
  /** Plate box. Three sizes only: 168×168, 240×160, 200×280. */
  w: number
  h: number
  /** Start position on the 1330×1230 canvas — the physics moves it from here. */
  left: number
  top: number
  /** Non-default object-position, to keep a subject in frame. */
  objectPosition?: string
}

// The nine link cards, in the handoff's DOM order (which is also the order the
// mobile collage cycles through).
export const HERO_CARDS: HeroCard[] = [
  {
    key: 'rubirosa',
    href: 'https://share.google/gNrQPgJ7vDw5qQvZB',
    caption: 'Rubirosa’s — Shop, Paris 2e',
    image: '/home/rubirosa-fit-location.png',
    w: 200, h: 280, left: 110, top: 40,
  },
  {
    key: 'eou',
    href: 'https://eouglobal.com/',
    caption: 'eou.world — Korean streetwear & athleisure',
    image: '/home/eou-website-fit.png',
    w: 200, h: 280, left: 1080, top: 30,
  },
  {
    key: 'whr',
    href: 'https://www.whr.institute/',
    caption: 'Western Hydrodynamic Research — Bucket hat, five colourways',
    image: '/home/western-hat-fit-product.png',
    w: 168, h: 168, left: 270, top: 430,
  },
  {
    key: 'vogue',
    href: 'https://www.vogue.com/article/lauren-rubinski-rubirosas-9-5-style',
    caption: 'Vogue — Lauren Rubinski doesn’t dress to impress',
    image: '/home/rubiroa-fit-article.png',
    w: 240, h: 160, left: 620, top: 400,
    objectPosition: '50% 12%',
  },
  {
    key: 'plasticana',
    href: 'https://merci-merci.com/en/products/plasticana-mules-opana-chanvre',
    caption: 'Plasticana — Woven leather loafers',
    image: '/home/plasticana-fit-product.png',
    w: 168, h: 168, left: 900, top: 440,
  },
  {
    key: 'cherry',
    href: 'https://share.google/gNrQPgJ7vDw5qQvZB',
    caption: 'Cherry — Paris, 7ème',
    image: '/home/cherry-interior-location.png',
    w: 200, h: 280, left: 1120, top: 380,
  },
  {
    key: 'noguchi',
    href: 'https://shop.noguchi.org/products/akari-1a',
    caption: 'Noguchi Museum — Akari 1A light sculpture',
    image: '/home/noguchi-interior.png',
    w: 168, h: 168, left: 60, top: 780,
  },
  {
    key: 'service',
    href: 'https://service-projects.com/',
    caption: 'Service Works — Chrome sundae coupe',
    image: '/home/service-works-interior-product.png',
    w: 168, h: 168, left: 600, top: 760,
  },
  {
    key: 'interview',
    href: 'https://www.usm.com/en-uk/stories/nigo-from-japan-with-love',
    caption: 'Interview — Inside Nigo’s archive',
    image: '/home/nigo-interior-article.png',
    w: 240, h: 160, left: 830, top: 860,
  },
]

// A card in the depth hero's fleet: same fields as HeroCard minus the canvas
// position — the depth field lays out by slot, not coordinates.
export type DepthCard = {
  key: string
  href: string
  caption: string
  image: string
  /** Plate box. Three sizes only: 168×168, 240×160, 200×280. */
  w: number
  h: number
  objectPosition?: string
}

// The depth hero's fleet: the original nine, plus fifteen Tim picked from
// real saves via /preview/hero-picker (2026-09-01, plate shape assigned from
// each image's own aspect). Captions hand-tidied to `Brand — what it is`;
// images frozen into /public/home like everything else on this page.
export const DEPTH_HERO_CARDS: DepthCard[] = [
  ...HERO_CARDS.map(({ left: _l, top: _t, ...rest }) => rest),
  {
    key: 'aufi',
    href: 'https://aufi.com/',
    caption: 'AUFI — Top creative & branding agencies',
    image: '/home/aufi-agency-index.png',
    w: 240, h: 160,
  },
  {
    key: 'tansan',
    href: 'https://tansanmagnesium.kr/',
    caption: 'Tansan Magnesium — Outerwear, tops & accessories',
    image: '/home/tansan-magnesium-shop.jpg',
    w: 240, h: 160,
  },
  {
    key: 'martiniano',
    href: 'https://martinianoshoes.com/collections/shop/products/glove-white',
    caption: 'Martiniano — Glove White',
    image: '/home/martiniano-glove-product.jpg',
    w: 240, h: 160,
  },
  {
    key: 'sightunseen',
    href: 'https://www.sightunseen.com/2014/11/sight-unseen-jewelry-by-architects/',
    caption: 'Sight Unseen — Jewelry by architects',
    image: '/home/sight-unseen-jewelry-article.jpg',
    w: 168, h: 168,
  },
  {
    key: 'terada',
    href: 'https://www.teradahonke.co.jp/en/ufufu/',
    caption: 'Terada Honke — Café Ufufu',
    image: '/home/terada-honke-ufufu-location.jpg',
    w: 240, h: 160,
  },
  {
    key: 'postalco',
    href: 'https://postalco.com/en-us/products/viewpoint-in-the-fog',
    caption: 'POSTALCO — Viewpoint in the Fog',
    image: '/home/postalco-viewpoint-product.jpg',
    w: 200, h: 280,
  },
  {
    key: 'emilydawnlong',
    href: 'https://www.emilydawnlong.com/',
    caption: 'Emily Dawn Long — New York womenswear',
    image: '/home/emily-dawn-long-website.jpg',
    w: 240, h: 160,
  },
  {
    key: 'thinkingmachines',
    href: 'https://thinkingmachines.ai/news/learning-to-replicate-expert-judgment-in-financial-tasks/',
    caption: 'Thinking Machines — Replicating expert judgment',
    image: '/home/thinking-machines-article.jpg',
    w: 240, h: 160,
  },
  {
    key: 'sardine',
    href: 'https://www.galeriesardine.com/therewhen',
    caption: 'Galerie Sardine — There, When',
    image: '/home/galerie-sardine-show.jpg',
    w: 200, h: 280,
  },
  {
    key: 'geo',
    href: 'https://geo-nyc.com/',
    caption: 'G.E.O. — Creative agency, New York',
    image: '/home/geo-nyc-agency.png',
    w: 240, h: 160,
  },
  {
    key: 'etched',
    href: 'https://www.etched.com/',
    caption: 'Etched — Frontier inference clusters',
    image: '/home/etched-website.png',
    w: 240, h: 160,
  },
  {
    key: 'adhome',
    href: 'https://www.architecturaldigest.com/gallery/see-how-a-crumbling-1890s-east-la-home-was-restored-to-its-former-glory',
    caption: 'Architectural Digest — An 1890s East LA home, restored',
    image: '/home/ad-east-la-home-article.jpg',
    w: 240, h: 160,
  },
  {
    key: 'ebur',
    href: 'https://studioebur.com/product/giza-suspension-2',
    caption: 'EBUR — Giza Suspension II',
    image: '/home/ebur-giza-product.jpg',
    w: 200, h: 280,
  },
  {
    key: 'heist',
    href: 'https://www.heist.co/',
    caption: 'Heist — Specialty decaf without a curfew',
    image: '/home/heist-coffee-website.jpg',
    w: 240, h: 160,
  },
  {
    key: 'intelligencer',
    href: 'https://nymag.com/intelligencer/article/new-york-salaries-jobs.html',
    caption: 'Intelligencer — What do you do and what do you make?',
    image: '/home/intelligencer-salaries-article.jpg',
    w: 240, h: 160,
  },
]

// Ghost list plates — a `+` over an "Add to …" label. 179×180, no caption.
export const HERO_LISTS = [
  { key: 'list-furniture', label: 'Furniture Reccs', href: '/remi/furniture-reccs', left: -40, top: 420 },
  { key: 'list-fit', label: 'Fit Check', href: '/tim/the-fit-check', left: 940, top: 620 },
]

// Profile plates — Cardo name over a bracketed count. 168×168, no caption.
export const HERO_PROFILES = [
  { key: 'tim', name: 'Tim', count: '142 items', href: '/tim', left: 330, top: 830 },
  { key: 'remi', name: 'Remi', count: '96 items', href: '/remi', left: 1130, top: 760 },
]

export const STEPS = [
  {
    key: 'save',
    title: 'Save anything, in one click',
    body: 'The extension icon files the page you are on. Or upload your own links by hand.',
  },
  {
    key: 'lists',
    title: 'Gather links into lists',
    body: 'Drop a bullet into a list from anywhere. The list is a link of its own.',
  },
  {
    key: 'search',
    title: 'Everything one field away',
    body: 'Type two words and the thing you half-remember comes back.',
  },
  {
    key: 'handle',
    title: 'Your own link for links',
    body: 'A real page at your own address. Send it to one person or a thousand.',
  },
]

// Featured tables. Real Bulletin pages only, so every row clicks through;
// counts are fixed per the handoff (this page makes no DB call).
export const FEATURED_PROFILES = [
  { name: 'Tim', href: '/tim', count: '142 items', thumbs: ['/home/rubiroa-fit-article.png', '/home/western-hat-fit-product.png'] },
  { name: 'Remi', href: '/remi', count: '96 items', thumbs: ['/home/noguchi-interior.png', '/home/cherry-interior-location.png'] },
  { name: 'Hugh', href: '/hugh', count: '61 items', thumbs: ['/home/service-works-interior-product.png', '/home/nigo-interior-article.png'] },
]

export const FEATURED_LISTS = [
  { name: 'The Fit Check', href: '/tim/the-fit-check', count: '38 items', thumbs: ['/home/plasticana-fit-product.png', '/home/western-hat-fit-product.png', '/home/eou-website-fit.png'] },
  { name: 'Furniture Reccs', href: '/remi/furniture-reccs', count: '24 items', thumbs: ['/home/noguchi-interior.png', '/home/cherry-interior-location.png', '/home/blouse-paris-location.jpg'] },
  { name: 'AI tools', href: '/tim/ai-tools', count: '17 items', thumbs: ['/home/nigo-interior-article.png', '/home/service-works-interior-product.png', '/home/rubirosa-fit-location.png'] },
]

/**
 * The caption mask stop, as a percentage: the fade occupies the final 46px of
 * the plate's width, so a long title dissolves inside the plate instead of
 * wrapping or overrunning.
 */
export function captionMask(plateWidth: number): string {
  const stop = Math.max(0, Math.round(((plateWidth - 46) / plateWidth) * 100))
  return `linear-gradient(90deg,#000 0%,#000 ${stop}%,transparent 100%)`
}
