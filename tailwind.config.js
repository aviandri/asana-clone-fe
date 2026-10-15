/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff1f0',
          100: '#ffe0dd',
          500: '#f06a6a',
          600: '#e8384f',
          700: '#c92a3f',
        },
        sidebar: { DEFAULT: '#1e1f21', hover: '#2a2b2d', active: '#3a3b3d', text: '#e1e1e2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
