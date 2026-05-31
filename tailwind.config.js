/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        serif: ['var(--font-display)', 'Georgia', 'Cambria', 'serif'],
      },
      colors: {
        // Vintage-print surface
        paper: '#f2ece0',   // warm ivory canvas
        ink: '#211d18',     // warm near-black text
        // Jewel-tone palette (gem taxonomy — used heavily in Phase 2)
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
