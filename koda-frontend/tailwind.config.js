/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          primary: 'var(--accent-active)',
        },
        slate: {
          50: '#FFFFFF',
          100: '#FFFFFF', 
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: 'var(--text-muted)',
          500: 'var(--text-muted)',
          600: 'var(--text-muted)',
          700: 'var(--text-main)',
          800: 'var(--text-main)',
          900: 'var(--text-main)',
          950: 'var(--text-main)',
        },
        koda: {
          main: '#0B5156',
          mainHover: '#083a3d',
          dark: 'var(--koda-dark)',
          surface: 'var(--koda-surface)',
          primary: 'var(--koda-primary)',
          secondary: 'var(--koda-secondary)',
          accent: 'var(--koda-accent)',
          success: '#10b981',
          danger: '#ef4444',
          warning: '#f59e0b',
        }
      }
    },
  },
  plugins: [],
}
