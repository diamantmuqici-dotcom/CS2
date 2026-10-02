/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        // Slow rotation for the LOCAL LINK map plate. Kept cheap (a single
        // transform on a 1px-border element) and gated behind motion-safe.
        spin: {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'pulse-ring': {
          '0%, 100%': { opacity: '0.35', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.06)' },
        },
      },
      colors: {
        tac: {
          bg: '#090c10',
          panel: '#10151c',
          panel2: '#161d26',
          border: '#232e3c',
          amber: '#f59e0b',
          cyan: '#06b6d4',
          emerald: '#10b981',
          crimson: '#ef4444',
          slate: '#94a3b8'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
