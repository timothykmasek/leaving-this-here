# Brand fonts

Self-hosted via `next/font/local`, wired in `app/fonts.ts` and exposed as the CSS
vars `--font-sans` and `--font-serif` (see `tailwind.config.js`).

| File | Family | Role | License |
|------|--------|------|---------|
| `MierA-*.woff2` | Mier A (Book/Regular/DemiBold/Bold) | Headlines, body, all UI | Licensed, provided by Tim |
| `Cardo-*.woff2` | Cardo (Reg/Bold/Italic) | Editorial: bios, taglines, list line | OFL, ship-safe |

Cardo is subset to Latin scripts (Basic, Latin-1, Extended A/B and Additional,
combining marks, punctuation, currency, arrows). To re-subset from the upstream
files, see the `pyftsubset` command in the 2026-09-30 commit message.

MOCA and Routed Gothic Wide were retired 2026-08-15; their files were removed
2026-09-30 (still in git history).
