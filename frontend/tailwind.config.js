/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0A1628',
          800: '#0D1F3C',
          700: '#162848',
          600: '#1E3558',
        },
        teal: {
          400: '#00B4D8',
          500: '#0096B7',
        },
        gold: {
          400: '#F4C430',
          500: '#D4A017',
        },
      },
    },
  },
  plugins: [],
}
