/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // KartingNow brand
        bg: '#000000',
        surface: '#111111',
        card: '#0a0a0a',
        border: '#1a1a1a',
        accent: '#9fe556',       // KartingNow green
        'accent-hover': '#b8f070',
        'accent-dim': 'rgba(159, 229, 86, 0.15)',
        muted: '#e5e5e5',
        // Tier colors
        'tier-100': '#9fe556',   // Brand green for best
        'tier-75': '#c8e946',
        'tier-50': '#e5d43a',
        'tier-25': '#e59a2e',
        'tier-1': '#e54444',
      },
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
