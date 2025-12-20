/** @type {import('tailwindcss').Config} */
const path = require('node:path');

const plugins = [];
try {
  plugins.push(require('@tailwindcss/forms'));
} catch {}
try {
  plugins.push(require('@tailwindcss/typography'));
} catch {}

module.exports = {
  darkMode: 'class',
  content: [
    path.resolve(__dirname, './index.html'),
    path.resolve(__dirname, './src/**/*.{js,ts,jsx,tsx}'),

    // 👇 Only the packages you actually import from:
    path.resolve(__dirname, '../../packages/shared/**/*.{js,ts,jsx,tsx}'),
    // path.resolve(__dirname, '../../packages/ui/**/*.{js,ts,jsx,tsx}'),

    // 👇 Guardrail: never scan node_modules anywhere under packages
    '!' + path.resolve(__dirname, '../../packages/**/node_modules/**'),
  ],
  theme: {
    extend: {
      colors: {
        primary: '#A259FF',
        secondary: '#8B30FF',
        plum: '#2A1E5C',
        softPink: '#FF70A6',
        softGray: '#FDF7F3',
        mutedGray: '#6E6C7A',
        darkText: '#333333',
        gold: '#FFD700',
        darkBg: '#101a23',
        darkCard: '#223649',
        darkTextPrimary: '#ffffff',
        darkTextSecondary: '#4f6b88',
      },
      fontFamily: {
        sans: [
          'Poppins',
          'ui-sans-serif',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'Arial',
          'Noto Sans',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Segoe UI Symbol',
        ],
        display: ['Montserrat', 'Poppins', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins,
};
