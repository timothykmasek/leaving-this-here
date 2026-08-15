# Card redesign — Ship 02 (per-type Primary Card)

Living decision log for the card rebuild. The redesign replaces today's rigid
272×270 inset-thumb card with the Bulletin DS **Primary Card** — one flexible
primitive whose **mask aspect + fit + affordance** vary by `card_type`, giving
each kind of link its own render (mymind-style).

- Source of truth: Figma **ProjectX**, Primary Card symbol `886:3378`
  (Mask group + label + foot gradients); full profile frame `886:254`.
- Design system bundle: `~/Desktop/Bulletin Design System.zip`.
- Image-selection logic this builds on: [card-images.md](card-images.md)
  (`classifyCardType` → `pickCardImage`).

## Workflow (how we ship this)

1. **Branch:** all Ship 02 work lives on `ship-02-cards`, never straight to `main`.
2. **Preview-first, then port.** Iterate the card in `/preview/cards` against real
   data until the *card* is signed off; only then swap it into the live grid
   (`BookmarkCard` / `ProfileClient`). Two separately-reviewable phases.
3. **Review gate:** `/code-review` on the branch before merge; `/code-review ultra`
   for the live-grid port. Browser-verify each step.
4. **This doc** records every taxonomy/fit/label decision — no re-litigating in chat.

## Data inventory (2026-08-14, 1,126 bullets)

Grounds which templates actually earn their keep. Run:
`node scripts/card-type-inventory.mjs`

| card_type | count | has og | note |
|---|---:|---:|---|
| screenshot | 927 | 142 | homepages / landing — **82% of everything** |
| article | 124 | 124 | ≈ today's card |
| product | 21 | 21 | clean |
| (null) | 20 | 17 | older unclassified |
| composite | 15 | 15 | social w/ og |
| fullbleed | 9 | 9 | shop product photo |
| profile | 4 | 3 | |
| lth / book / tweet | 3 / 2 / 1 | | tiny |
| **video / audio / tiktok** | **0** | | not emitted by `classifyCardType` yet |

**Implications:**
- The humble **screenshot/landing** card is the highest-leverage template, not the
  glamour ones. Build order by real value: primitive → article → product → screenshot.
- **Video/Audio/TikTok templates are unfed** until we add classification for them.
  Building those layouts now is building ahead of data. Deferred.

## Component map

- [`lib/cardFormat.ts`](../lib/cardFormat.ts) — `resolveCategory(url, card_type)`:
  resolves a bullet to one of the 8 categories at RENDER time. Strong URL/domain
  signals win first (a youtube link is Video even if card_type says 'article'),
  else the stored card_type, else Website. No DB migration, fully reversible.
  Each category → { aspect (imageless-plate shape), affordance }.
- [`components/PrimaryCard.tsx`](../components/PrimaryCard.tsx) — the shared primitive.
  Reuses `CardThumb` (og→screenshot→favicon fallback chain) + `FaviconPlate`.
  Renders the affordance overlay (play / disc / mic / source-favicon).
- [`app/preview/cards/page.tsx`](../app/preview/cards/page.tsx) — real-data preview.
  Not linked anywhere; delete when Ship 02 lands.

## Decisions

### Settled
- **One primitive, not N components.** Every template is `PrimaryCard` with a
  different mask aspect/fit/affordance — mirrors the Figma Mask group.
- **Title sits BELOW the plate** (muted), not inside the image. Per DS.
- **Ground-first already shipped** (Ship 01: dot grid, rivets gone).
- **Label legibility → adaptive colour** (2026-08-15). Sample the image's top-left
  lightness, dark ink on light / white on dark. Implemented client-side in
  `PrimaryCard` (`useAdaptiveLabelDark`) via a crossOrigin probe + canvas luminance.
  Works where the host sends CORS — **Supabase screenshots (the 82% bucket) do**;
  external og hosts that taint fall back to white+shadow. `contain` cards are on a
  white plate → always dark ink, no sampling.
  ⚠️ **Production follow-up:** move the lightness calc server-side (compute once at
  save/backfill, store a flag) so it's robust on every host + free at render. The
  client probe is the /preview stand-in.
- **Image fit → NATURAL ASPECT** (2026-08-15, supersedes the earlier cover/contain
  split — Tim reversed it: *"don't like the white thing… screenshots get cropped"*).
  Cards render the image at its own aspect ratio — no forced crop, no white
  letterbox. The feed is a true masonry; each card is the shape of its image.
  `CardFormat.fit` removed; `aspect` now only shapes the imageless favicon plate.
- **Copy / caption** (2026-08-15, Figma nodes 886:1823 title, 886:10138 list line):
  - **Title** — Mier A Book 14px, wide tracking, **ONE line, ellipsis** (`truncate`).
  - **List line** — Cardo 14px, tight tracking, with a thin vertical tick prefix;
    renders **only if the bullet is in a list**. No list → no line → shorter card.
  - **Category label** — Mier A **Black** 14px (was Cardo; the bundle substituted).
- **Font: Mier A** self-hosted (2026-08-15). Tim supplied the family; woff2 for
  Book/Regular/DemiBold/Black in `app/fonts/`, wired as `--font-sans` / Tailwind
  `font-sans`. The redesign's interface grotesque (labels + titles).
  ⚠️ **Licensing:** Mier A is commercial and the repo is public — the woff2 are
  web-fetchable either way (as on any site), but confirm the Mier EULA permits
  self-hosting before this merges to `main`.

### Settled — taxonomy (2026-08-15)
Eight categories (Tim's call, grounded in the 30-link slot audit — see below):
**Website · Product · Article · Music · Podcast · Video · Social · Book.**
Consolidations vs mymind's 9: "Website" absorbs Web-Page + Business (kills the
ambiguous split); "Video" absorbs YouTube + TikTok; "Social" absorbs Reddit + X +
LinkedIn. Rationale: entity categories that fragment (Reddit=1, X=2, YT=2 links)
aren't worth splitting at Bulletin's volumes.

Mapping to current `card_type` (classifier work, tracked separately from layout):
- Website ← screenshot, lth, generic composite  · Product ← product, fullbleed
- Article ← article  · Social ← composite(social), tweet, profile  · Book ← book
- **Video / Music / Podcast** ← NEW domain detection (youtube/vimeo/tiktok;
  spotify-album/apple-music/bandcamp; spotify-episode/apple-podcasts).

**Slot-audit reality (1,126 links, 2026-08-15):** ~80% are company/product
homepages → **"Website" is the workhorse** (4 of 5 cards). Video/Music/Podcast/Book
are <1% each today — real templates, but a forward bet, not current volume. The
current classifier is also noisy (YouTube→article, Reddit→blocked screenshot).

### Open (need Tim)
1. **Mier EULA check** for public-repo self-hosting (see above) — gate before merge.

## Card layout — DONE (2026-08-15)
Natural-aspect plate · adaptive Mier-Black label · one-line Mier-Book title ·
optional Cardo list line · 8-category resolution (display layer) · affordances
(play/disc/mic/source-favicon). `price` + `avatar` affordances render nothing yet
(need price extraction / avatar data). Next: the live-grid port.

## Follow-ups (deferred, separate from the card layout)
- **Tall screenshot capture for Website cards.** mymind's site cards are portrait
  (tall slice of the page); ours are landscape browser-viewport captures
  (~1280×900), so uncropped they read short/wide. Matching mymind = capturing a
  taller slice — an **extension + backfill** change to the capture pipeline, not a
  card change. Website is 80% of the feed, so worth doing — later.
- **Real DB classification** (persist the 8 categories; fix classifier misfires).
  Not needed for rendering — `resolveCategory` handles it at display time — but
  cleaner long-term + unlocks search/filter by category.
- **`price` + `avatar` affordances** — need price extraction / social avatar data.

## Not in scope for Ship 02
- Tweet / Profile / TikTok templates (need extension DOM data / re-hosted frames).
- Lists-and-feed-on-one-page, centered identity block (later ships).
