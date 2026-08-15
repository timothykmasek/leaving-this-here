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

- [`lib/cardFormat.ts`](../lib/cardFormat.ts) — **PROVISIONAL** per-type format map
  (label · aspect · affordance). The taxonomy is not final (see open decisions).
- [`components/PrimaryCard.tsx`](../components/PrimaryCard.tsx) — the shared primitive.
  Reuses `CardThumb` (og→screenshot→favicon fallback chain) + `FaviconPlate`.
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

### Open (need Tim)
1. **Taxonomy / label names.** `Site` (screenshot), `Post` (composite), `Link` (lth)
   are placeholders (Tim: "placeholders", revisit later). Also: does the kit's
   Video-vs-Watch split survive, and what does `Buy`/`Product` collapse to?
2. **Mier EULA check** for public-repo self-hosting (see above).

## Not in scope for Ship 02
- Tweet / Profile / TikTok templates (need extension DOM data / re-hosted frames).
- Lists-and-feed-on-one-page, centered identity block (later ships).
