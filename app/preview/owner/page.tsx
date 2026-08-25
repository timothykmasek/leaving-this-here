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
import { ListCoverControl } from '@/components/ListCoverControl'
import { SuggestionShelf, forgetSuggestion } from '@/components/SuggestionShelf'
import { ImportFab } from '@/components/ImportFab'
import { BulletDetail } from '@/components/BulletDetail'
import { SiteFooter } from '@/components/SiteFooter'

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

// The profile's grid, so the fixed chrome here lines up the way it does there.
const OWNER_GRID = 'max-w-[1720px] px-4 sm:px-10'

export default function OwnerPreview() {
  // Each masthead owns its cover so clicking through the picker actually moves
  // this page, the way it moves the real one.
  const [bandCover, setBandCover] = useState<string | null>(null)
  const [photoCover, setPhotoCover] = useState<string | null>(IMAGES[3])
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
        title="Cover picker — default band"
        note="No cover chosen, so the list shows a band built from its own bullets. Hover the band: the cover control fades in. It offers the list's images ranked, an upload, and 'no cover' as a real third choice."
      >
        <ListMasthead
          name="The fit check"
          description="Clothes I would actually wear, mostly from people who make small numbers of things."
          count={BULLETS.length}
          ownerName="tim"
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          coverUrl={bandCover}
          stripThumbs={IMAGES}
          coverControl={
            <ListCoverControl
              listId="fixture-list"
              hasCover={!!bandCover}
              usingDefault={bandCover == null}
              candidates={IMAGES}
              onChange={setBandCover}
            />
          }
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="Cover picker — uploaded photo"
        note="A cover is set. The control must stay hidden until hover, otherwise it sits permanently on top of the photo the owner chose."
      >
        <ListMasthead
          name="Rooms I think about"
          description="Interiors with one idea each."
          count={BULLETS.length}
          ownerName="tim"
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          coverUrl={photoCover}
          stripThumbs={IMAGES}
          coverControl={
            <ListCoverControl
              listId="fixture-list"
              hasCover={!!photoCover}
              usingDefault={false}
              candidates={IMAGES}
              onChange={setPhotoCover}
            />
          }
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="Private list, no cover"
        note="'No cover' is a deliberate choice, not an empty state — the masthead should look composed without one. The private marker rides beside the title."
      >
        <ListMasthead
          name="Reading later"
          description=""
          count={0}
          ownerName="tim"
          backHref="/preview/owner"
          backLabel="&larr; All lists"
          coverUrl=""
          stripThumbs={IMAGES}
          isPrivate
          editControl={<PencilButton />}
        />
      </Section>

      <Section
        title="Suggestion shelf"
        note="Renders nothing here, and that is the correct answer: the shelf fetches its own suggestions, the fixture list id has none, and a shelf with nothing to say should not occupy the page. It also means this is the one surface fixtures cannot fully exercise — seeing 'You might also add' or 'Nothing left to suggest' needs a real list with real neighbours."
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

  const seed = () => {
    const rows = BULLETS.map((b, i) => ({
      id: b.id, url: b.url, title: b.title, description: b.description,
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
          onClick={() => forgetSuggestion(BULLETS[0].id)}
          disabled={!seeded}
          className="rounded-full border border-black/15 px-4 py-2 font-sans text-[12px] leading-4 tracking-[0.05em] hover:border-black/40 disabled:opacity-40"
        >
          Delete a bullet (first card must vanish)
        </button>
      </div>
      {seeded ? <SuggestionShelf key={nonce} listId={LIST_ID} onAdd={async () => {}} /> : null}
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
  ])
  const [fail, setFail] = useState(false)

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
          bullet={{ ...BULLETS[0], created_at: new Date('2026-08-07T00:00:00Z').toISOString(), note: null } as any}
          lists={lists}
          onClose={() => setOpen(false)}
          onNoteUpdate={() => {}}
          onDelete={() => setOpen(false)}
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
