/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f0f',
        surface: '#1a1a2e',
        card: '#16213e',
        accent: '#e94560',
        'tier-100': '#00ff00',
        'tier-75': '#80ff00',
        'tier-50': '#ffff00',
        'tier-25': '#ff8000',
        'tier-1': '#ff0000',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
