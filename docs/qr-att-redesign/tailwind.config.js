/** QR-att — Tailwind Black & Grey theme.
 *  Tailwind v3: export as tailwind.config.js.
 *  Tailwind v4: copy the @theme block from theme.css instead.
 */

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}', './docs/qr-att-redesign/**/*.html'],
  theme: {
    extend: {
      colors: {
        pitch: '#0A0A0A', // primary app bg
        ink: '#000000', // true black
        surface: {
          1: '#121212', // cards / sidebar
          2: '#18181B', // tables / secondary
          3: '#27272A', // raised / modal
        },
        line: {
          DEFAULT: '#3F3F46',
          subtle: 'rgb(63 63 70 / 0.55)',
          faint: 'rgb(63 63 70 / 0.32)',
        },
        fog: '#F4F4F5', // primary text
        ash: '#A1A1AA', // secondary text
        silver: '#D4D4D8', // neutral badge
        ok: { DEFAULT: '#86EFAC', dim: 'rgb(134 239 172 / 0.12)' },
        alert: { DEFAULT: '#FCA5A5', dim: 'rgb(252 165 165 / 0.12)' },
      },
      borderRadius: { card: '20px', sheet: '14px' },
      boxShadow: {
        card: '0 8px 24px rgb(0 0 0 / 0.45)',
        pop: '0 12px 32px rgb(0 0 0 / 0.55)',
      },
    },
  },
  plugins: [],
};
