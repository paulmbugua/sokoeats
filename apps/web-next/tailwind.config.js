const path = require('path');

const plugins = [];
try {
  plugins.push(require('@tailwindcss/forms')({ strategy: 'class' }));
} catch {}
try {
  plugins.push(require('@tailwindcss/typography'));
} catch {}

const p = (rel) => path.resolve(__dirname, rel).replace(/\\/g, '/');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    p('../../packages/shared/api/**/*.{ts,tsx}'),
    p('../../packages/shared/hooks/**/*.{ts,tsx}'),
    p('../../packages/shared/utils/**/*.{ts,tsx}'),
    p('../../packages/shared/context/**/*.{ts,tsx}'),
  ],
  safelist: ['prose', 'prose-sm', 'prose-base', 'prose-lg', 'prose-invert'],
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
      typography: {
        DEFAULT: {
          css: {
            color: '#1f2937',
            h1: { color: '#0f172a' },
            h2: { color: '#0f172a' },
            h3: { color: '#0f172a' },
            a: { color: '#4f46e5', textDecoration: 'none', fontWeight: '600' },
            'a:hover': { textDecoration: 'underline' },
            code: {
              backgroundColor: '#f3f4f6',
              padding: '0.125rem 0.25rem',
              borderRadius: '0.375rem',
            },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            pre: {
              backgroundColor: '#111827',
              color: '#f9fafb',
              borderRadius: '0.5rem',
              padding: '1rem',
            },
            hr: { borderColor: '#e5e7eb' },
            table: { width: '100%', tableLayout: 'auto' },
            'thead th': { backgroundColor: '#f9fafb' },
            th: { borderBottom: '1px solid rgba(148,163,184,0.40)' },
            td: { borderBottom: '1px solid rgba(148,163,184,0.40)' },
            blockquote: {
              borderLeftColor: '#d1d5db',
              color: '#374151',
            },
            '.katex-display': { overflowX: 'auto' },
          },
        },
        invert: {
          css: {
            '--tw-prose-body': '#e2e8f0',
            '--tw-prose-headings': '#ffffff',
            '--tw-prose-links': '#a5b4fc',
            '--tw-prose-bold': '#f1f5f9',
            '--tw-prose-counters': '#94a3b8',
            '--tw-prose-bullets': '#475569',
            '--tw-prose-hr': 'rgba(255,255,255,0.08)',
            '--tw-prose-quotes': '#f1f5f9',
            '--tw-prose-quote-borders': 'rgba(255,255,255,0.15)',
            '--tw-prose-captions': '#94a3b8',
            '--tw-prose-code': '#f1f5f9',
            '--tw-prose-th-borders': 'rgba(255,255,255,0.12)',
            '--tw-prose-td-borders': 'rgba(255,255,255,0.08)',
            a: { color: '#a5b4fc' },
            'a:hover': { color: '#c7d2fe' },
            code: { backgroundColor: 'rgba(255,255,255,0.08)' },
            'code::before': { content: 'none' },
            'code::after': { content: 'none' },
            pre: { backgroundColor: 'rgba(0,0,0,0.6)', color: '#e2e8f0' },
            table: { width: '100%', tableLayout: 'auto' },
            'thead th': {
              backgroundColor: 'rgba(255,255,255,0.06)',
              position: 'sticky',
              top: '0',
              backdropFilter: 'blur(2px)',
            },
            th: {
              borderBottomColor: 'rgba(255,255,255,0.08)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
            },
            td: {
              borderBottomColor: 'rgba(255,255,255,0.08)',
              borderBottomWidth: '1px',
              borderBottomStyle: 'solid',
            },
            hr: { borderColor: 'rgba(255,255,255,0.08)' },
            blockquote: {
              borderLeftColor: 'rgba(255,255,255,0.2)',
              color: '#e2e8f0',
            },
            '.katex-display': { overflowX: 'auto' },
          },
        },
      },
    },
  },
  plugins,
};
