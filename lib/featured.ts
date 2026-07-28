// Curated homepage example bullets, by URL, in display order.
// Empty → the homepage carousel falls back to recent image-bearing bullets.
// (brasshands.com requested but not in the collection — omitted.)
export const FEATURED_URLS: string[] = [
  'https://crosby.ai/',
  'https://www.pairs-socks.com/',
  'https://www.getbasis.ai/',
  'https://www.kiki.computer/',
  'https://dmcg.co/',
  'https://www.callbaba.com/',
  'https://www.skinmetal.com/',
  'https://manorsgolf.com/',
  'https://getpom.com/',
  'https://www.thiings.co/things',
  'https://www.thursdaylabs.co/',
  'https://www.tavus.io/product/video-generation',
  'https://wastenot.world/category/shippers-and-boxes',
  'https://easternrodeo.co/',
  'https://www.hipcamp.com/en-AU',
]

// Frozen homepage card images, keyed by URL.
//
// The marketing homepage is our shopfront: its example cards must be locked and
// beautiful, never drifting between loads. Normally a card's image is chosen at
// RENDER time from the bookmark row (og:image vs. captured screenshot, see
// lib/cardImage), and background jobs (persist-screenshots, backfill-images)
// rewrite those columns afterward — so the same featured card could flip from a
// rich og:image to a cropped screenshot, or (as happened to Crosby & Pairs) to a
// stale thum.io URL that some earlier seeding wrote.
//
// To pin the shopfront, the homepage renders THESE exact URLs instead of
// recomputing from the row (see app/page.tsx). A URL present here wins; anything
// not listed falls back to the normal render-time selection. Entries are the
// current best image per card — external og:images (self-hosted by the site) or
// our own permanent Supabase Storage copies. Crosby & Pairs point at their real
// og:image heroes, restoring the originals the thum.io overwrite clobbered.
const SB = 'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images'

export const FEATURED_IMAGES: Record<string, string> = {
  // Restored to their real og:image heroes (were overwritten with cropped thum.io strips).
  'https://crosby.ai/':
    'https://cdn.sanity.io/images/q0rw6tov/production/0f7ad0ae733ad98919db05ca5eaaf684cfa93fe1-1920x1080.png?w=1200&q=85&auto=format&fit=crop&h=628&fm=jpg',
  'https://www.pairs-socks.com/':
    'https://www.pairs-socks.com/cdn/shop/files/20250710_PAIRS_HERO_MERINO_LILAC_041.jpg?v=1756716955',
  // The rest are already-good images, frozen to lock the shopfront.
  'https://www.getbasis.ai/': `${SB}/a364955e-e207-4a69-98cf-fc4d8c5b7140.webp`,
  'https://www.kiki.computer/': `${SB}/729d0b83-d0e9-4f3b-b773-599c6f5511ff.webp`,
  'https://dmcg.co/': `${SB}/54b3ac94-b00b-4be2-b3f3-7b9c9992b9d5.webp`,
  'https://www.callbaba.com/': `${SB}/18b7660a-4886-4e15-a729-c66c6d79057d.webp`,
  'https://www.skinmetal.com/': `${SB}/ad09f167-d141-4793-9730-0c9b721a2137.webp`,
  'https://manorsgolf.com/': `${SB}/thumb/be63016d-adf0-4655-a460-1b27d839a931.webp`,
  'https://getpom.com/':
    'https://cdn.shopify.com/s/files/1/0640/6458/5892/files/socialsharing.png?v=1765306743',
  'https://www.thiings.co/things': 'https://www.thiings.co/meta-new.png',
  'https://www.thursdaylabs.co/': `${SB}/dba5cc28-fc2b-45a8-afa4-49f367e38911.webp`,
  'https://www.tavus.io/product/video-generation':
    'https://cdn.prod.website-files.com/68a3622d17312a5dc16e5cc6/68c726371c9da69ce10a4895_Frame%202147228889.png',
  'https://wastenot.world/category/shippers-and-boxes':
    'https://wastenot.world/images/opengraph.jpg',
  'https://easternrodeo.co/': `${SB}/thumb/03150481-e789-41f8-9a47-366601bc1ec6.webp`,
  'https://www.hipcamp.com/en-AU':
    'https://hipcamp-res.cloudinary.com/image/upload/c_fill,f_auto,g_auto,h_400,q_60,w_780/v1626916641/campground-photos/kfczlkysihhwvncgreuj.jpg',
}
