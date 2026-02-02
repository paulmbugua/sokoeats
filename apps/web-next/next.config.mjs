// apps/web-next/next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const legacyAppOrigin = (process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN || 'http://localhost:5173')
  .toString()
  .trim()
  .replace(/\/+$/, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@mytutorapp/shared'],

  // keep this minimal to silence turbopack + preserve your aliases
  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname, 'src'),
      'react-native$': 'react-native-web',
      'react-native/Libraries/Utilities/Platform': 'react-native-web/dist/exports/Platform',
    },
    resolveExtensions: [
      '.web.tsx',
      '.web.ts',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
      '.json',
    ],
  },

  async redirects() {
    return [
      { source: '/robot-teach', destination: '/app/robot-teach', permanent: false },
      { source: '/login', destination: '/app/login', permanent: false },
      { source: '/org', destination: '/app/org', permanent: false },
      { source: '/org/login', destination: '/app/org/login', permanent: false },
      { source: '/messages', destination: '/app/messages', permanent: false },
      { source: '/settings/:path*', destination: '/app/settings/:path*', permanent: false },
      { source: '/courses/:path*', destination: '/app/courses/:path*', permanent: false },
      { source: '/class-vault/:path*', destination: '/app/class-vault/:path*', permanent: false },
      { source: '/progress/:path*', destination: '/app/progress/:path*', permanent: false },
      { source: '/results', destination: '/app/results', permanent: false },
      { source: '/profile/:path*', destination: '/app/profile/:path*', permanent: false },
    ];
  },

  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];

    // ✅ IMPORTANT:
    // Your Vite app expects base "/app/".
    // So when Next serves "/app/*", proxy to legacy as "/app/*" (do NOT strip the prefix).
    return [
      // Legacy app mounted under /app/*
      { source: '/app/:path*', destination: `${legacyAppOrigin}/app/:path*` },

      // Also proxy Vite runtime/module paths if they appear at root (some setups do)
      { source: '/@vite/:path*', destination: `${legacyAppOrigin}/app/@vite/:path*` },
      { source: '/@react-refresh', destination: `${legacyAppOrigin}/app/@react-refresh` },
      { source: '/src/:path*', destination: `${legacyAppOrigin}/app/src/:path*` },
      { source: '/assets/:path*', destination: `${legacyAppOrigin}/app/assets/:path*` },

      // Vite dev can request these directly (esp. monorepos / optimizeDeps)
      { source: '/@fs/:path*', destination: `${legacyAppOrigin}/app/@fs/:path*` },
      { source: '/node_modules/:path*', destination: `${legacyAppOrigin}/app/node_modules/:path*` },

      // common public files
      { source: '/favicon.ico', destination: `${legacyAppOrigin}/app/favicon.ico` },
      { source: '/robots.txt', destination: `${legacyAppOrigin}/app/robots.txt` },
      { source: '/manifest.webmanifest', destination: `${legacyAppOrigin}/app/manifest.webmanifest` },
      { source: '/vite.svg', destination: `${legacyAppOrigin}/app/vite.svg` },
    ];
  },
};

export default nextConfig;
