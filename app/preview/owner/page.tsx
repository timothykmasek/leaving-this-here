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
import { SuggestionShelf } from '@/components/SuggestionShelf'
import { ImportFab } from '@/components/ImportFab'

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
          updatedAt={new Date('2026-08-20T09:23:00Z').toISOString()}
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
          updatedAt={new Date('2026-08-11T18:02:00Z').toISOString()}
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
        <SuggestionShelf listId="fixture-list" onAdd={async () => {}} />
      </Section>

      <Section
        title="Import button"
        note="Fixed to the viewport, above the cards, on the right. Scroll this page: it should stay put and never collide with the footer."
      >
        <p className="font-sans text-[12px] leading-4 tracking-[0.05em] text-black/45">
          Rendered fixed — look bottom right, and scroll.
        </p>
      </Section>

      <ImportFab />
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
