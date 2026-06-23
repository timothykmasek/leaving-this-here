# Brand fonts

Self-hosted via `next/font/local` — wired in `app/fonts.ts`, exposed as CSS vars
`--font-display`, `--font-serif`, `--font-label` (see `tailwind.config.js`).

| File | Family | Role | License |
|------|--------|------|---------|
| `Moca-Black.woff2` | MOCA Black | Display / hero headlines | EDITO web license (EULA-EDITO-2026, on file) |
| `Cardo-*.woff2` | Cardo (Reg/Bold/Italic) | Item titles + reading body | OFL — ship-safe |
| `RoutedGothicWide-*.woff2` | Routed Gothic Wide (Reg/Italic) | UI labels (`.label`) | Public domain — ship-safe |

Spec source: Figma "ProjectX" node 695:856.
Label spec: uppercase, 10px, 1.5px tracking — baked into the `.label` utility in `app/globals.css`.

MOCA web license covers self-hosting on the site. Note: the repo is public, so the
raw woff2 is publicly fetchable — fine for serving, but verify EDITO's redistribution
terms (or make the repo private) if that's a concern.
