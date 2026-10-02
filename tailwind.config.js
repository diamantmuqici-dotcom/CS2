/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
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
