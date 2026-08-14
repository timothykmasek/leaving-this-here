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

### Open (need Tim)
1. **Label legibility.** White label vanishes on light imagery (Valarian, white-bg
   Graphpaper). Options: (a) adaptive black/white by image lightness, or (b) a small
   dark scrim chip behind the label. Leaning (b) — always works, simpler.
2. **Fit mode per type.** Confirm: **cover** for article / screenshot / composite;
   **contain-on-white ("padded catalog")** for product / book. Currently everything
   is cover, which crops landscape product logos badly.
3. **Taxonomy / label names.** `Site` (screenshot), `Post` (composite), `Link` (lth)
   are placeholders. Also: does the kit's Video-vs-Watch split survive, and what does
   `Buy`/`Product` collapse to?

## Not in scope for Ship 02
- Tweet / Profile / TikTok templates (need extension DOM data / re-hosted frames).
- Lists-and-feed-on-one-page, centered identity block (later ships).
