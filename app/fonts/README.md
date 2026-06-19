# Brand fonts

Self-hosted via `next/font/local` — wired in `app/fonts.ts`, exposed as CSS vars
`--font-display`, `--font-serif`, `--font-label` (see `tailwind.config.js`).

| File | Family | Role | License |
|------|--------|------|---------|
| `Moca-Black.woff2` | MOCA Black | Display / hero headlines | ⚠️ **TRIAL — EDITO eval copy. Buy web license before production.** |
| `Cardo-*.woff2` | Cardo (Reg/Bold/Italic) | Item titles + reading body | OFL — ship-safe |
| `RoutedGothicWide-*.woff2` | Routed Gothic Wide (Reg/Italic) | UI labels (`.label`) | Public domain — ship-safe |

Spec source: Figma "ProjectX" node 695:856.
Label spec: uppercase, 10px, 1.5px tracking — baked into the `.label` utility in `app/globals.css`.

## TODO before launch
- [ ] Replace `Moca-Black.woff2` (trial) with the licensed EDITO web font.
