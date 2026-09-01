// The screens only the owner ever sees.
//
// A cover picker, an edit pencil, a suggestion shelf and an import button all
// render behind `session.user.id === profile.id`. Signed out — which is how
// anyone reviewing this app usually looks at it — none of them exist. They have
// repeatedly shipped having compiled but never having been LOOKED at.
//
// This page renders them against fixtures so they can be seen and clicked
// without an account. Local images from /public/home, no database, no session.
//
//   npm run dev  →  http://localhost:3000/preview/owner
//
// What it does NOT prove: these are the real components with fake data, so it
// shows appearance and interaction, not that the queries behind them are right.
// Uploading a cover here will fail — the list id isn't real — and that failure
// is itself worth seeing, since it's the error path a user would hit offline.

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PrimaryCard } from '@/components/PrimaryCard'
import { ListMasthead } from '@/components/ListMasthead'
import { SuggestionShelf, forgetSuggestion } from '@/components/SuggestionShelf'
import { ImportFab } from '@/components/ImportFab'
import { BulletDetail } from '@/components/BulletDetail'
import { SiteFooter } from '@/components/SiteFooter'
import { Masonry } from '@/components/Masonry'
import { CollectionCard } from '@/components/CollectionCard'
import { CardFallback } from '@/components/CardFallback'

// Real local files, so cards look like cards rather than grey boxes.
const IMAGES = [
  '/home/rubirosa-fit-location.png',
  '/home/eou-website-fit.png',
  '/home/cherry-interior-location.png',
  '/home/noguchi-interior.png',
  '/home/plasticana-fit-product.png',
  '/home/western-hat-fit-product.png',
]

const BULLETS = [
  {
    id: 'fixture-1',
    url: 'https://eouglobal.com/',
    // A raw og:title, the way it arrives from the site — lib/cardTitle turns
    // this into 'Brand — what it is' at render time.
    title: 'eou',
    description: 'Seoul label making quiet technical basics.',
    imageUrl: IMAGES[1],
    screenshotUrl: null,
    faviconUrl: 'https://www.google.com/s2/favicons?domain=eouglobal.com&sz=64',
  },
  {
    id: 'fixture-2',
    url: 'https://www.plasticana.com/',
    cardType: 'product' as const,
    title: 'Clogs — Hemp sole',
    description: 'French footwear made from hemp rather than plastic.',
    imageUrl: IMAGES[4],
    screenshotUrl: null,
    faviconUrl: null,
    product: { priceFormatted: '€120', price: 120, currency: 'EUR' },
  },
  {
    id: 'fixture-3',
    url: 'https://maps.app.goo.gl/fixtureCherryParis',
    title: 'Cherry Paris',
    description: 'Small room, short menu, natural wine.',
    imageUrl: IMAGES[2],
    screenshotUrl: null,
    faviconUrl: null,
    place: {
      name: 'Cherry Paris',
      kind: 'Restaurant',
      price: '€€',
      rating: '4.6',
      reviews: '284',
      address: '1 Rue du Sabot, 75006 Paris',
      city: 'Paris',
      lat: null,
      lon: null,
      photo: null,
      photoBox: null,
      source: 'fixture',
    },
  },
]

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-black/10 py-14">
      <h2 className="font-sans text-[12px] uppercase leading-4 tracking-[0.05em] text-black/45">{title}</h2>
      <p className="mb-8 mt-2 max-w-[52ch] font-serif text-[14px] leading-[22px] text-black/60">{note}</p>
      {children}
    </section>
  )
}


// Four bullets from Tim's own library that really are gone — found by probing
// 150 of his 1,115 links and keeping the 404s. Real titles, real images, real
// images, so the screen is judged on what it would actually hold rather than
// on invented copy. All four were saved between one and three years ago, which
// is the shape of rot: nothing saved last week is dead yet.
const DEAD = [
  {
    id: 'dead-1',
    url: 'https://replicate.com/stability-ai/stable-video-diffusion',
    title: 'stability-ai/stable-video-diffusion – Run with an API on Replicate',
    description: null,
    imageUrl:
      'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/7ccbbfa6-e121-431f-83ba-2288cacf0457.webp',
    screenshotUrl: null,
    faviconUrl: null,
  },
  {
    id: 'dead-2',
    url: 'https://artiken.com/collections/creative/products/every-damn-day-blue',
    title: 'Every Damn Day',
    description: null,
    imageUrl:
      'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/e7b5e68e-b7d7-48df-8a59-83a84e0c4c21.webp',
    screenshotUrl: null,
    faviconUrl: null,
  },
  {
    id: 'dead-3',
    url: 'https://creatorx.app/',
    title: 'Core Access',
    description: 'We headhunt & recruit talented creators to create for company accounts.',
    imageUrl:
      'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/aae94da0-eef3-4d5f-8e05-3ce9e3734790.webp',
    screenshotUrl: null,
    faviconUrl: null,
  },
  {
    id: 'dead-4',
    url: 'https://difaino.com/',
    title: 'Difaino Harting — Building Brands for Scale & Exit',
    description: 'Operator and mentor helping founders move beyond dropshipping.',
    imageUrl:
      'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/71fd1cc3-69be-4ac8-96fd-c87f8523b038.webp',
    screenshotUrl: null,
    faviconUrl: null,
  },
]


// Three real no-image bullets from the seeded preview profiles, with whatever
// the pipeline actually managed to collect for each — which is the point: one
// has a description, one has only a name, one has a name and a dead domain.
const NO_IMAGE = [
  {
    domain: 'drinkoaza.com',
    brand: 'Drinkoaza',
    faviconUrl: null,
    description:
      'A non-alcoholic aperitif built on botanicals rather than imitation — bitter, dry, and meant to be drunk the way you would drink the real thing.',
    why: 'has a description',
  },
  {
    domain: 'arrowmoc.com',
    brand: 'Arrowmoc',
    faviconUrl: null,
    description: null,
    why: 'name only — no description',
  },
  {
    domain: 'livinkombucha.com',
    brand: 'Livin Kombucha',
    faviconUrl: null,
    description: 'Small-batch kombucha.',
    why: 'description too short to be prose',
  },
]

// The profile's grid, so the fixed chrome here lines up the way it does there.
const OWNER_GRID = 'max-w-[1720px] px-4 sm:px-10'

export default function OwnerPreview() {
  const [opened, setOpened] = useState<string | null>(null)

  return (
    <main className="mx-auto max-w-[1100px] px-6 pb-40 pt-16">
      <header className="pb-4">
        <Link href="/preview/profile" className="font-sans text-[12px] leading-4 tracking-[0.05em] text-black/45 hover:text-ink">
          &larr; Previews
        </Link>
        <h1 className="mt-6 font-sans text-[20px] font-[600] leading-6">Owner-only surfaces</h1>
        <p className="mt-2 max-w-[56ch] font-serif text-[14px] leading-[22px] text-black/60">
          Everything here normally requires being signed in as the person who owns the page.
          Fixtures, not real data — this shows how they look and behave, not whether their
          queries are correct.
        </p>
      </header>

      <Section
        title="Edit pencil on a card"
        note="Hover a card. A pencil appears top-left and a black tack top-right, and the card swings down from the tack. The pencil must sit above the full-card link, or it opens the bullet instead of editing it."
      >
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {BULLETS.map((b) => (
            <PrimaryCard key={b.id} {...b} onOpen={() => setOpened(b.title)} />
          ))}
        </div>
        <p className="mt-6 font-sans text-[12px] leading-4 tracking-[0.05em] text-black/45">
          {opened ? `pencil clicked → ${opened}` : 'pencil not clicked yet'}
        </p>
      </Section>

      <Section
        title="List masthead — display title"
        note="The name at poster scale in Cardo, one line always. Hover the meta row: the owner's pencil fades in beside the back link. Covers and descriptions are retired — the name is the identity."
      >
        <ListMasthead
          name="The fit check"
          count={BULLETS.length}
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="List masthead — long name"
        note="A long name never wraps and never resizes the masthead: it runs off the right edge and melts into white. The fade must only render when the name actually overflows."
      >
        <ListMasthead
          name="Rooms I think about when I cannot sleep at night"
          count={BULLETS.length}
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="List masthead — private, empty"
        note="The private marker rides with the count, and an empty list still reads composed: '0 Bullets · Private' in the card metadata voice."
      >
        <ListMasthead
          name="Reading later"
          count={0}
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          isPrivate
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="Suggestion shelf"
        note="Seed it, then add one. A card lands in the grid ABOVE the shelf — as it does on a real list page — and the shelf must NOT slide down the screen: the page grows under a held scroll position, which reads as being thrown upward into whatever was above. Then add or dismiss all seven. Acting on a card must swap ONLY that card — the others hold their columns — and when the last one goes the whole section should disappear, rule and heading with it, rather than sitting there announcing its own emptiness."
      >
        <ShelfHarness />
      </Section>

      <Section
        title="Bullet detail — creating a list"
        note="Type a name and press enter. The chip must appear greyed IMMEDIATELY, carrying the name you typed, and only then fill in — pressing enter used to await the whole round trip before even clearing the input, so nothing moved and there was no way to tell if it had worked. The fake create here takes 1.5s so the pending state is easy to see; a failure hands your typing back rather than eating it."
      >
        <ShowDetail />
      </Section>

      <Section
        title="Cards with no picture"
        note="About a quarter of the seeded library has no usable image — sites that serve no og:image, sites that refuse a capture, sites that are gone. The old fallback showed the favicon over the domain in grey caps, which threw away the title, the description and the type, and repeated the brand that is already printed directly beneath the card. These are three real failures from the preview profiles. A card with no photograph should still be a card."
      >
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
          {NO_IMAGE.map((b) => (
            <div key={b.domain}>
              <div className="overflow-hidden rounded-[20px] bg-card ring-1 ring-black/[0.03]" style={{ aspectRatio: '3 / 4' }}>
                <CardFallback
                  domain={b.domain}
                  faviconUrl={b.faviconUrl}
                  brand={b.brand}
                  description={b.description}
                />
              </div>
              <p className="mt-3 font-serif text-[14px] leading-[22px] text-black/70">{b.brand}</p>
              <p className="label mt-1 text-black/30">{b.why}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Dead links — where the count lives, and what it opens"
        note="A line under the LISTS grid, and behind it the cards with nothing on them but the question — per Tim. A count on the tab row would have followed you across both tabs whether or not you were tidying; this only appears where you are already looking at how your links are organised. A line rather than a card, even an outlined one: a card claims a slot in the grid\'s rhythm and reads as a collection you might open for pleasure, and this is a maintenance door — findable, otherwise invisible. Owner-only, and absent entirely when nothing is dead."
      >
        <DeadLinks />
      </Section>

      <Section
        title="Import button, against the revealed footer"
        note="Both are rendered on the profile's own grid, and the footer below is forced open. The button must land on the same vertical line the cards end on — not 24px from the window — and must clear the footer bar without either of them moving. It used to fade out whenever that bar came up, so scrolling up made the control vanish."
      >
        <p className="font-sans text-[12px] leading-4 tracking-[0.05em] text-black/45">
          Look bottom right. The footer bar below is pinned open.
        </p>
      </Section>

      <ImportFab widthClassName={OWNER_GRID} />
      <SiteFooter reveal revealed widthClassName={OWNER_GRID} />
    </main>
  )
}

function PencilButton() {
  return (
    <button
      aria-label="Edit list name and description"
      className="inline-flex text-current transition-colors hover:text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4z" />
      </svg>
    </button>
  )
}

// The shelf fetches its own suggestions, so fixtures alone render nothing. But
// it also paints from its sessionStorage cache on mount, which gives us a way
// in: seed the cache, mount the shelf, and it renders real cards through the
// real code path.
//
// That makes one specific regression testable. Deleting a bullet used to leave
// its card sitting in the shelf until a reload — forgetSuggestion() purged the
// cache, which only governs the NEXT mount, while the shelf on screen kept its
// suggestions in React state. "Delete a bullet" below runs the real
// forgetSuggestion; the card must vanish immediately.
function ShelfHarness() {
  const LIST_ID = 'fixture-list'
  const [seeded, setSeeded] = useState(false)
  const [nonce, setNonce] = useState(0)
  const [added, setAdded] = useState<typeof BULLETS>([])

  const seed = () => {
    // Seven, deliberately: the shelf shows four, so acting on one has to pull a
    // replacement in. That backfill is where the jolt lived.
    const source = [...BULLETS, ...BULLETS, ...BULLETS].slice(0, 7)
    const rows = source.map((b, i) => ({
      id: `${b.id}-${i}`, url: b.url, title: `${b.title} ${i + 1}`, description: b.description,
      image_url: b.imageUrl, screenshot_url: null, favicon_url: null,
      card_type: null, image_pref: null, is_private: false, note: null,
      created_at: new Date('2026-08-01T00:00:00Z').toISOString(),
      customImage: null, similarity: 0.9 - i * 0.01,
    }))
    sessionStorage.setItem(`bulletin:shelf:${LIST_ID}`, JSON.stringify(rows))
    localStorage.removeItem(`bulletin:shelf:dismissed:${LIST_ID}`)
    setSeeded(true)
    setNonce((n) => n + 1)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <button onClick={seed} className="rounded-full border border-black/15 px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] hover:border-black/40">
          Seed the shelf
        </button>
        <button
          onClick={() => forgetSuggestion('fixture-1-0')}
          disabled={!seeded}
          className="rounded-full border border-black/15 px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] hover:border-black/40 disabled:opacity-40"
        >
          Delete a bullet (first card must vanish)
        </button>
      </div>
      {/* A grid ABOVE the shelf that grows when you add — which is what the
          real list page does, and the whole reason adding used to jolt. With a
          no-op onAdd nothing above changed and the bug could not be seen here. */}
      {added.length > 0 && (
        // One column on purpose: in a four-up grid the first four adds fill
        // row one and the block does not get taller, so nothing above the shelf
        // moves and the bug cannot be reproduced. Stacked, every add grows it.
        <div className="mb-4 grid grid-cols-1 gap-y-[40px]">
          {added.map((b, i) => (
            <PrimaryCard
              key={`${b.id}-${i}`}
              id={`${b.id}-added-${i}`}
              url={b.url}
              title={b.title}
              description={b.description}
              imageUrl={b.imageUrl}
              screenshotUrl={null}
              faviconUrl={null}
            />
          ))}
        </div>
      )}
      {seeded ? (
        <SuggestionShelf
          key={nonce}
          listId={LIST_ID}
          onAdd={async (sug) => {
            // A round trip, like the real insert.
            await new Promise((r) => setTimeout(r, 200))
            setAdded((prev) => [...prev, BULLETS[prev.length % BULLETS.length]])
          }}
        />
      ) : null}
    </div>
  )
}

// The bullet-detail modal only opens for the owner, from the hover pencil. This
// mounts it directly against fixtures so the list-creation feedback can be seen
// without an account. onCreateList deliberately takes 1.5s — the pending chip is
// invisible against a fast local server, and slow is the case that matters.
function ShowDetail() {
  const [open, setOpen] = useState(false)
  const [lists, setLists] = useState([
    { id: 'l1', name: 'Ecommerce Sites', bookmark_ids: ['fixture-1'] },
    { id: 'l2', name: 'The fit check', bookmark_ids: [] },
    // Enough non-member rows to overflow the three-row well (scroll + fade),
    // and names that collide with likely typing so the typeahead's
    // "Add to this List" row can be seen before creating a duplicate.
    { id: 'l3', name: 'Product Design Patterns', bookmark_ids: [] },
    { id: 'l4', name: 'Rooms I think about', bookmark_ids: [] },
    { id: 'l5', name: 'Must Buys', bookmark_ids: [] },
  ])
  const [fail, setFail] = useState(false)
  const [pinnedAt, setPinnedAt] = useState<string | null>(null)

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <button onClick={() => setOpen(true)} className="rounded-full border border-black/15 px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] hover:border-black/40">
          Open the modal
        </button>
        <button onClick={() => setFail((f) => !f)} className="rounded-full border border-black/15 px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] hover:border-black/40">
          Create should {fail ? 'fail' : 'succeed'}
        </button>
      </div>
      {open && (
        <BulletDetail
          bullet={{ ...BULLETS[0], created_at: new Date('2026-08-07T00:00:00Z').toISOString(), note: null, pinned_at: pinnedAt } as any}
          lists={lists}
          onClose={() => setOpen(false)}
          onNoteUpdate={() => {}}
          onTitleUpdate={() => {}}
          onDelete={() => setOpen(false)}
          onTogglePin={(_id, pin) => setPinnedAt(pin ? new Date().toISOString() : null)}
          onToggleListMembership={(listId, bookmarkId, add) =>
            setLists((prev) =>
              prev.map((l) =>
                l.id !== listId
                  ? l
                  : {
                      ...l,
                      bookmark_ids: add
                        ? [...l.bookmark_ids, bookmarkId]
                        : l.bookmark_ids.filter((x) => x !== bookmarkId),
                    }
              )
            )
          }
          onCreateList={async (name, ids) => {
            await new Promise((r) => setTimeout(r, 1500))
            if (fail) return null
            const id = `l${lists.length + 1}`
            setLists((prev) => [...prev, { id, name, bookmark_ids: ids || [] }])
            return id
          }}
        />
      )}
    </div>
  )
}

// How "12 links look dead" would work, end to end.
//
// Three things are being proposed here and each can be argued with separately:
//
//   1. WHERE the count sits — on the tab row, opposite the pill.
//   2. WHAT clicking it does — filters the existing grid, rather than
//      navigating to a screen that would have to re-draw the same cards.
//   3. HOW a dead card reads — the white chip the price already uses, in the
//      slot the price already occupies, over a dimmed image. Reusing that
//      mechanism rather than inventing a badge means one legible treatment on
//      any photograph instead of two competing ones.
//
// Keep and Delete sit under the card as one row, the same shape as the
// suggestion shelf's Add and dismiss — two answers to one question, both
// always visible. Keep does not repair the link; it silences the flag, which
// is the honest verb for "I know, and I want it anyway".
function DeadLinks() {
  const [reviewing, setReviewing] = useState(false)
  const [resolved, setResolved] = useState<Record<string, 'kept' | 'deleted'>>({})
  const open = DEAD.filter((d) => !resolved[d.id])

  // Stand-ins for the real lists, so the drawer can be seen in the company it
  // would actually keep.
  const LISTS = [
    { name: 'VCs / Investors', count: 14, thumbs: [IMAGES[0], IMAGES[3], IMAGES[2]] },
    { name: 'Agencies & Studios', count: 11, thumbs: [IMAGES[1], IMAGES[4], IMAGES[5]] },
    { name: 'Green Energy', count: 11, thumbs: [IMAGES[2], IMAGES[0], IMAGES[1]] },
  ]

  if (reviewing) {
    return (
      <div>
        <button
          onClick={() => setReviewing(false)}
          className="label mb-6 text-black/30 underline decoration-black/15 underline-offset-4 transition-colors hover:text-ink"
        >
          &larr; Back to lists
        </button>
        <Masonry>
          {open.map((d) => (
            <div key={d.id} className="group relative">
              {/* No badge, no status, no dimming. You clicked "links look
                  dead" — every card here is dead, and saying so on each one is
                  restating the door you just came through. What is left is the
                  card and the question, exactly like the suggestion shelf. */}
              <PrimaryCard
                id={d.id}
                url={d.url}
                title={d.title}
                description={d.description}
                imageUrl={d.imageUrl}
                screenshotUrl={d.screenshotUrl}
                faviconUrl={d.faviconUrl}
              />
              {/* Two answers to one question, both always visible — the shape
                  the suggestion shelf already uses. Keep does not repair the
                  link; it silences the flag, which is the honest verb for
                  "I know, and I want it anyway". */}
              <div className="mt-2 flex items-stretch gap-2">
                <button
                  onClick={() => setResolved((p) => ({ ...p, [d.id]: 'kept' }))}
                  className="label flex-1 rounded-full border border-black/10 py-2 text-ink transition-colors hover:bg-ink hover:text-white"
                >
                  Keep
                </button>
                <button
                  onClick={() => setResolved((p) => ({ ...p, [d.id]: 'deleted' }))}
                  className="label rounded-full border border-black/10 px-4 text-black/40 transition-colors hover:border-black/30 hover:text-ink"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </Masonry>
        {open.length === 0 && (
          <p className="max-w-[52ch] font-serif text-[14px] leading-[22px] text-black/50">
            All four resolved. Go back and the drawer is gone with them — reload to start over.
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-x-[40px] gap-y-[40px] sm:grid-cols-3 lg:grid-cols-4">
        {LISTS.map((l) => (
          <CollectionCard key={l.name} name={l.name} count={l.count} thumbs={l.thumbs} />
        ))}
      </div>

      {/* A line under the grid, not a card in it. A card — even an outlined one
          — claims a slot in the rhythm and reads as a collection you might
          open for pleasure. This is a maintenance door: it should be findable
          and otherwise invisible. Same label voice as the shelf's heading. */}
      {open.length > 0 && (
        <button
          onClick={() => setReviewing(true)}
          className="label mt-10 text-black/30 underline decoration-black/15 underline-offset-4 transition-colors hover:text-ink"
        >
          {open.length} links look dead &middot; review
        </button>
      )}
    </div>
  )
}
