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
      // Motion (see src/motion/tokens.ts): ease-out to enter, 120–220ms, transform/opacity only.
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'rise-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        pop: { '0%': { transform: 'scale(1)' }, '40%': { transform: 'scale(1.25)' }, '100%': { transform: 'scale(1)' } },
        'check-draw': { from: { strokeDashoffset: '1' }, to: { strokeDashoffset: '0' } },
        settle: { '0%': { transform: 'translateY(-2px)', opacity: '0.7' }, '100%': { transform: 'none', opacity: '1' } },
      },
      animation: {
        'fade-in': 'fade-in 120ms cubic-bezier(0.16,1,0.3,1) both',
        'rise-in': 'rise-in 180ms cubic-bezier(0.16,1,0.3,1) both',
        pop: 'pop 220ms cubic-bezier(0.16,1,0.3,1)',
        'check-draw': 'check-draw 220ms cubic-bezier(0.16,1,0.3,1) both',
        settle: 'settle 220ms cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
};
