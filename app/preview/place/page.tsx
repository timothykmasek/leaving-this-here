import { PrimaryCard } from '@/components/PrimaryCard'
import { BracketLabel } from '@/components/BulletinHeader'
import { TileMap, MapPin, type MapStyle } from '@/components/TileMap'
import { parsePlaceUrl, geocodePlace } from '@/lib/placeLink'

// Scratchpad — visual treatments for a PLACE bullet (a Google/Apple Maps link).
// Driven by Tim's real save: the Cherry Paris link, which lands today as a
// screenshot of Google's bot-check page titled "Google Maps".
//
// Every treatment here is key-free: the place name comes out of the URL path,
// the coordinates + address from OpenStreetMap's geocoder, the imagery from
// open raster tiles. Nothing calls a Google API.
//
// Not linked anywhere. Delete once a treatment is chosen.

export const revalidate = 86400

const SAVED_URL =
  'https://www.google.com/maps/place/Cherry+Paris/data=!4m2!3m1!1s0x0:0xe8a6758c5cadfe04?sa=X&ved=1t:2428&hl=en-SG&ictx=111&cshid=1787299572907448'
const SAVED_SCREENSHOT =
  'https://xtnqvjaexkztcrriotjj.supabase.co/storage/v1/object/public/card-images/42ca6f0d-9c2b-4cfd-9360-b02539eed949.jpg'

const W = 360

// Cropped out of the extension's own capture (public/preview/cherry-hero-crop.jpg)
// — Google's hero photo for the place, minus Google's chrome. Everything in
// CAPTURED below is legible in that same screenshot and is unreachable from a
// server-side fetch, which only ever sees the bot wall.
const HERO_CROP = '/preview/cherry-hero-crop.jpg'
const CAPTURED = {
  name: 'Cherry Paris',
  rating: '4.3',
  reviews: '133',
  price: '€100+',
  kind: 'Restaurant',
  address: '1 Rue du Sabot, 75006 Paris',
  hours: 'Opens 7 pm',
}

// Warm the cool grey basemap toward Bulletin's paper. Tuned by eye against
// #f1f1f1 card / #2b2b2b ink.
const PAPER_FILTER = 'sepia(0.42) saturate(0.72) contrast(1.06) brightness(1.03) hue-rotate(-8deg)'
// The neutral alternative — the rebrand palette is deliberately colourless
// ("colour comes from the photography, not the chrome"), and a sepia map is
// chrome that carries colour. This strips it back to greys.
const NEUTRAL_FILTER = 'grayscale(1) contrast(1.09) brightness(1.02)'
// The warm map's paper tone, for chrome that has to sit flush against it.
const WARM_PLATE = '#efeae1'

// Verbatim from PrimaryCard — the live card's caption styles. Kept as consts so
// the preview can't quietly drift from the component it's proposing a change to.
const TITLE_CLS =
  'font-sans text-[14px] font-[400] leading-5 tracking-[0.03em] text-ink'
const TITLE_MASK =
  '[-webkit-mask-image:linear-gradient(to_right,#000_88%,transparent)] [mask-image:linear-gradient(to_right,#000_88%,transparent)]'
const SECONDARY_CLS =
  'font-serif text-[14px] leading-[18px] tracking-[-0.01em]'

function Caption({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <>
      <p className={`mt-3 overflow-hidden whitespace-nowrap ${TITLE_CLS} ${TITLE_MASK}`}>
        {title}
      </p>
      {sub && (
        <p className={`mt-1.5 flex items-center gap-[7px] truncate ${SECONDARY_CLS} text-ink/55`}>
          <span aria-hidden className="flex shrink-0 flex-col items-center justify-center gap-[2px] opacity-60">
            <span className="h-[2px] w-[2px] rounded-full bg-current" />
            <span className="h-[2px] w-[2px] rounded-full bg-current" />
            <span className="h-[2px] w-[2px] rounded-full bg-current" />
          </span>
          <span className="truncate">{sub}</span>
        </p>
      )}
    </>
  )
}

/** The real caption's second line: the LIST this bullet sits in. Not the address. */
function ListLine({ name }: { name: string }) {
  return (
    <p className={`mt-3 flex items-center gap-[7px] truncate ${SECONDARY_CLS} text-ink/55`}>
      <span aria-hidden className="flex shrink-0 flex-col items-center justify-center gap-[2px] opacity-60">
        <span className="h-[2px] w-[2px] rounded-full bg-current" />
        <span className="h-[2px] w-[2px] rounded-full bg-current" />
        <span className="h-[2px] w-[2px] rounded-full bg-current" />
      </span>
      <span className="truncate">{name}</span>
    </p>
  )
}

/** Rating as a corner badge — the same affordance slot as play / disc / mic. */
function RatingBadge({ rating }: { rating: string }) {
  return (
    <span className="label pointer-events-none absolute bottom-3 left-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-[5px] text-white ring-1 ring-white/25 backdrop-blur-[2px]">
      <span aria-hidden>★</span>{rating}
    </span>
  )
}

function Treatment({
  tag, note, children,
}: { tag: string; note: string; children: React.ReactNode }) {
  return (
    <div style={{ width: W }}>
      <div className="mb-3">
        <BracketLabel>{tag}</BracketLabel>
      </div>
      {children}
      <p className="mt-4 font-serif text-[13px] leading-[17px] text-ink/45">{note}</p>
    </div>
  )
}

/** The shared plate chrome — same radius / ring / lift as the live card. */
function Plate({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] bg-card ring-1 ring-black/[0.03] card-lift">
      {children}
    </div>
  )
}

function MapPlate({
  lat, lon, zoom, style, filter, height, pin = 'ink',
}: {
  lat: number; lon: number; zoom: number; style: MapStyle
  filter?: string; height: number; pin?: 'ink' | 'white'
}) {
  return (
    <TileMap lat={lat} lon={lon} zoom={zoom} width={W} height={height} style={style} filter={filter}>
      <MapPin tone={pin} />
    </TileMap>
  )
}

export default async function PlacePreview() {
  const parsed = parsePlaceUrl(SAVED_URL)
  const place = parsed.name
    ? await geocodePlace(parsed.name, { lat: parsed.lat, lon: parsed.lon })
    : null

  if (!place) {
    return (
      <main className="min-h-screen p-16 font-serif text-ink">
        Geocoder returned nothing for {JSON.stringify(parsed.name)} — the treatments
        below need coordinates. (Nominatim rate-limits to ~1 req/sec; try a reload.)
      </main>
    )
  }

  const kind = place.kind ? place.kind.replace(/_/g, ' ') : null
  const where = [place.addressLine, place.city].filter(Boolean).join(', ')
  const shortWhere = place.addressLine || place.city || ''

  return (
    <main className="min-h-screen">
      <div className="mx-auto max-w-[1330px] px-6 py-16">
        <div className="mb-2">
          <BracketLabel>Scratchpad · Place cards</BracketLabel>
        </div>
        <h1 className="mb-1 font-serif text-2xl text-ink">
          A Maps link, twelve ways
        </h1>
        <p className="mb-3 max-w-2xl font-serif text-sm text-ink/60">
          All twelve render the same saved bullet — your Cherry Paris link. Treatment A is
          what&apos;s live today. B–H are key-free: the name is parsed out of the URL path
          (<code>/maps/place/Cherry+Paris</code>), the coordinates and address come from
          OpenStreetMap&apos;s geocoder, and the imagery is open raster tiles. No Google API,
          no billing account.
        </p>
        <p className="mb-12 max-w-2xl font-serif text-sm text-ink/45">
          Resolved: <strong className="text-ink/70">{place.name}</strong>
          {kind && <> · {kind}</>} · {where} · {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
        </p>

        <div className="flex flex-wrap gap-x-12 gap-y-16">
          {/* ── A · the baseline ─────────────────────────────────────────── */}
          <Treatment
            tag="A · Today"
            note="What's live now. The screenshot is a real capture, but it's Google's chrome — a search field, a cookie bar, no sense of place. Title falls back to the site name."
          >
            <PrimaryCard
              url={SAVED_URL}
              title="Google Maps"
              description="Find local businesses, view maps and get driving directions in Google Maps."
              imageUrl={null}
              screenshotUrl={SAVED_SCREENSHOT}
              faviconUrl="https://www.google.com/s2/favicons?domain=www.google.com&sz=64"
              cardType="article"
            />
          </Treatment>

          {/* ── B · paper map ────────────────────────────────────────────── */}
          <Treatment
            tag="B · Paper map"
            note="Carto Positron warmed with a CSS filter to sit on Bulletin's paper. Minimal labels, so the pin and the street pattern carry it. Reads as a card, not a screenshot."
          >
            <Plate>
              <MapPlate lat={place.lat} lon={place.lon} zoom={16} style="positron" filter={PAPER_FILTER} height={270} />
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── C · voyager ──────────────────────────────────────────────── */}
          <Treatment
            tag="C · Street map"
            note="Carto Voyager, untinted. More colour — parks green, water blue — so it's livelier but louder, and it fights the neutral chrome the rebrand settled on."
          >
            <Plate>
              <MapPlate lat={place.lat} lon={place.lon} zoom={16} style="voyager" height={270} />
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── D · satellite ────────────────────────────────────────────── */}
          <Treatment
            tag="D · Satellite"
            note="Esri World Imagery at z18. Texture and rooftops make it feel like a real location, and it's the only option that varies a lot card-to-card. Weakest for a place you can't recognise from above."
          >
            <Plate>
              <MapPlate lat={place.lat} lon={place.lon} zoom={18} style="satellite" height={270} pin="white" />
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── E · dark ─────────────────────────────────────────────────── */}
          <Treatment
            tag="E · Dark map"
            note="Carto Dark. High contrast against a white feed — it pops, which is exactly the risk: one dark tile in a masonry of paper cards pulls every eye to it."
          >
            <Plate>
              <MapPlate lat={place.lat} lon={place.lon} zoom={16} style="dark" height={270} pin="white" />
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── F · editorial listing ────────────────────────────────── */}
          <Treatment
            tag="F · Guide listing"
            note="No big map — the card is a guide entry. Name in Cardo, category and arrondissement as labels, a map medallion for orientation. Cheapest to render, and the only treatment that still works when the geocoder returns no coordinates at all."
          >
            <Plate>
              <div className="flex h-[290px] flex-col justify-between p-6">
                <div>
                  <p className="label text-ink/40">{kind ?? 'Place'}</p>
                  <p className="mt-3 font-serif text-[30px] leading-[1.08] tracking-[-0.015em] text-ink">
                    {place.name}
                  </p>
                  <p className="mt-2 font-serif text-[15px] leading-[1.3] text-ink/55">
                    {place.addressLine}
                  </p>
                </div>
                <div className="flex items-end justify-between">
                  <p className="label text-ink/45">
                    {place.city}
                    {place.country ? ` · ${place.country}` : ''}
                  </p>
                  {/* z16 at 104px — z15 in a 76px window landed on blank block
                      interior and read as an empty circle. */}
                  <div className="overflow-hidden rounded-full ring-1 ring-black/[0.06]">
                    <TileMap
                      lat={place.lat} lon={place.lon} zoom={16}
                      width={104} height={104} style="positron" filter={NEUTRAL_FILTER}
                    >
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-1/2 top-1/2 h-[10px] w-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-[3px] ring-white"
                      />
                    </TileMap>
                  </div>
                </div>
              </div>
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── G · map + label bar ──────────────────────────────────────── */}
          <Treatment
            tag="G · Map + plate"
            note="B's map with the name set into the card itself rather than the caption below. Self-contained — survives being screenshotted or shared out of context — but repeats the title if the caption stays."
          >
            <Plate>
              <div className="relative">
                <MapPlate lat={place.lat} lon={place.lon} zoom={16} style="positron" filter={PAPER_FILTER} height={230} />
                <div className="px-5 pb-5 pt-4" style={{ backgroundColor: WARM_PLATE }}>
                  <p className={`truncate ${TITLE_CLS}`}>{place.name}</p>
                  <p className="label mt-2 text-ink/45">
                    {kind ? `${kind} · ` : ''}{place.city}
                  </p>
                </div>
              </div>
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── H · neutral map ──────────────────────────────────────────── */}
          <Treatment
            tag="H · Neutral map"
            note="B with the warmth pulled out — pure greys. Obeys the rebrand rule that the chrome stays colourless and the photography carries colour, so it disappears into a mixed feed instead of tinting one corner of it."
          >
            <Plate>
              <MapPlate lat={place.lat} lon={place.lon} zoom={16} style="positron" filter={NEUTRAL_FILTER} height={270} />
            </Plate>
            <Caption title={`${place.name} — ${kind ?? 'place'}`} sub={shortWhere} />
          </Treatment>

          {/* ── I · the photo we already have ────────────────────────────── */}
          <Treatment
            tag="I · Photo from capture"
            note="Not a new fetch — this is cropped out of the screenshot the extension already took, in Tim's own logged-in browser. No API key, no bot wall, and it's storable the same way every other Bulletin screenshot is."
          >
            <Plate>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={HERO_CROP} alt="" className="block w-full" />
            </Plate>
            <Caption title={`${CAPTURED.name} — restaurant`} sub={CAPTURED.address} />
          </Treatment>

          {/* ── J · photo + the facts in the same capture ────────────────── */}
          <Treatment
            tag="J · Photo + facts"
            note="The same crop with the rest of what's legible in that one screenshot. Rating, price band and hours never survive a server-side fetch — and note the address here is the real one, ~100m from where the geocoder put the pin."
          >
            <Plate>
              <div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={HERO_CROP} alt="" className="block w-full" />
                <div className="px-5 pb-5 pt-4">
                  <p className={`truncate ${TITLE_CLS}`}>{CAPTURED.name}</p>
                  <p className="label mt-2 text-ink/45">
                    {CAPTURED.kind} · {CAPTURED.price}
                  </p>
                  <p className={`mt-2.5 flex items-center gap-2 ${SECONDARY_CLS} text-ink/55`}>
                    <span className="text-ink/70">★ {CAPTURED.rating}</span>
                    <span className="text-ink/25">·</span>
                    <span>{CAPTURED.reviews} reviews</span>
                    <span className="text-ink/25">·</span>
                    <span>{CAPTURED.hours}</span>
                  </p>
                  <p className={`mt-1 truncate ${SECONDARY_CLS} text-ink/45`}>
                    {CAPTURED.address}
                  </p>
                </div>
              </div>
            </Plate>
            <Caption title={`${CAPTURED.name} — restaurant`} sub={CAPTURED.address} />
          </Treatment>

          {/* ── K · J, de-duplicated ─────────────────────────────────────── */}
          <Treatment
            tag="K · Self-contained"
            note="J with each fact said once. Rating moves to the affordance badge, the caption drops back to its real job (the list), and hours are gone — opening times go stale the moment they're stored, and a cached 'Opens 7 pm' is simply wrong on a Monday closure."
          >
            <Plate>
              <div>
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={HERO_CROP} alt="" className="block w-full" />
                  <RatingBadge rating={CAPTURED.rating} />
                </div>
                <div className="px-5 pb-5 pt-4">
                  <p className={`truncate ${TITLE_CLS}`}>{CAPTURED.name}</p>
                  <p className="label mt-2 text-ink/45">
                    {CAPTURED.kind} · {CAPTURED.price}
                  </p>
                  <p className={`mt-2.5 truncate ${SECONDARY_CLS} text-ink/50`}>
                    {CAPTURED.address}
                  </p>
                </div>
              </div>
            </Plate>
            <ListLine name="Paris, next trip" />
          </Treatment>

          {/* ── L · nothing on the card at all ──────────────────────────── */}
          <Treatment
            tag="L · Feed-native"
            note="The other direction: the plate is just the photo, and the caption does what it does on every other card. Keeps the feed's rhythm — and honours the 2026-08-15 call that categories live off-card, which K's label quietly reopens."
          >
            <Plate>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={HERO_CROP} alt="" className="block w-full" />
                <RatingBadge rating={CAPTURED.rating} />
              </div>
            </Plate>
            <Caption title={`${CAPTURED.name} — ${CAPTURED.address}`} sub={null} />
            <ListLine name="Paris, next trip" />
          </Treatment>
        </div>

        <div className="mt-20 max-w-2xl border-t border-black/[0.07] pt-6">
          <p className="label mb-2 text-ink/40">
            Accuracy — the thing that decides whether this ships
          </p>
          <p className="mb-4 font-serif text-[13px] leading-[19px] text-ink/55">
            Across an 8-place sample, every treatment above is only as good as the
            geocode behind it. Resolution was correct 6/6 when the URL carried
            <code> @lat,lng</code> — and 0/2 when it didn&apos;t, where a chain name
            (&ldquo;Sightglass Coffee&rdquo;) landed in the wrong city and a generic one
            (&ldquo;Joe&rdquo;) matched an unrelated shop. Note that THIS bullet is a
            no-coordinates save: it came from a share sheet, so the pin is placed on a
            name lookup alone.
          </p>
          <p className="mb-6 font-serif text-[13px] leading-[19px] text-ink/55">
            So the lever isn&apos;t the card design — it&apos;s getting coordinates at save
            time. A Maps page open in the address bar normally carries them; the share
            link strips them. Until then, a no-coordinate save should fall back to
            treatment F, which needs no map and cannot place a pin somewhere wrong.
          </p>
          <p className="max-w-2xl font-serif text-[13px] leading-[18px] text-ink/40">
          Tiles © OpenStreetMap contributors, © CARTO; satellite imagery © Esri. Attribution
          is required wherever these render, so a shipped version needs this credit on or near
          the card — and should bake the composed map to storage at save time rather than
            pulling tiles per page view.
          </p>
        </div>
      </div>
    </main>
  )
}
