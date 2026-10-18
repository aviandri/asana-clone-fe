/** @type {import('tailwindcss').Config} */
// Mekari Project design tokens. Colours are CSS variables (src/index.css) exposed as Tailwind
// scales, so `bg-primary-500/40` etc. work. Tailwind's `gray` is remapped to Mekari neutrals and
// `blue` is not used for UI chrome (primary = Mekari purple; `info` = Mekari blue).
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const scale = (prefix, steps) => Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { ...scale('primary', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]), DEFAULT: v('primary-500') },
        gray: scale('gray', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        info: { DEFAULT: v('info'), soft: v('info-soft') },
        app: v('app-bg'),
        accent: { DEFAULT: v('accent'), soft: v('accent-soft') },
        badge: v('badge'),
        sidebar: {
          DEFAULT: v('sidebar-bg'),
          top: v('sidebar-top'),
          hover: v('sidebar-hover'),
          active: v('sidebar-active'),
          text: v('sidebar-text'),
          muted: v('sidebar-muted'),
          ring: v('sidebar-ring'),
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      ringColor: { DEFAULT: v('primary-500') },
    },
  },
  plugins: [],
};
