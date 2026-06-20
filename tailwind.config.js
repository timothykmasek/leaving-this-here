/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // MOCA Black — wordmark / hero display (license-pending; see app/fonts.ts)
        display: ['var(--font-display)', 'Georgia', 'serif'],
        // Cardo — item titles + reading serif (default body)
        serif: ['var(--font-serif)', 'Georgia', 'Cambria', 'serif'],
        // Routed Gothic Wide — UI labels (use the `.label` utility for the full spec)
        label: ['var(--font-label)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // ── Editorial rebrand palette (Figma ProjectX 695:856) ──
        // Neutral by design — color comes from the photography, not the chrome.
        paper: '#ffffff',   // page canvas (token name kept; was warm ivory)
        ink: '#2b2b2b',     // primary text; /50 = secondary, /80 = strong-secondary
        card: '#f1f1f1',    // card surface (20px radius)
        // ── Legacy vintage-gem jewel tones (still referenced by some components) ──
        garnet: '#8c2b3a',
        ruby: '#a31f34',
        topaz: '#2f6f8f',
        citrine: '#c4922f',
        emerald: '#1f6b4f',
        amethyst: '#6b4a8a',
        sapphire: '#2a4d8f',
        peridot: '#6f8f3a',
        aquamarine: '#4f9fae',
        opal: '#9bb3c9',
      },
    },
  },
  plugins: [],
}
