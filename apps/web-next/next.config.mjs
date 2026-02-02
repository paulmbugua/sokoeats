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

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
      'react-native$': 'react-native-web',
      'react-native/Libraries/Utilities/Platform': 'react-native-web/dist/exports/Platform',
    };
    config.resolve.extensions = Array.from(
      new Set([
        ...(config.resolve.extensions || []),
        '.web.tsx',
        '.web.ts',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.json',
      ])
    );
    return config;
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
    ];
  },

  async rewrites() {
    // ✅ Only proxy to Vite during development
    if (process.env.NODE_ENV !== 'development') return [];

    return [
      // Legacy app mounted under /app/*
      { source: '/app/:path*', destination: `${legacyAppOrigin}/:path*` },

      // ✅ Vite runtime + absolute root modules/assets referenced by the legacy app
      { source: '/@vite/:path*', destination: `${legacyAppOrigin}/@vite/:path*` },
      { source: '/@react-refresh', destination: `${legacyAppOrigin}/@react-refresh` },
      { source: '/src/:path*', destination: `${legacyAppOrigin}/src/:path*` },

      // Common static paths used by Vite/React apps
      { source: '/assets/:path*', destination: `${legacyAppOrigin}/assets/:path*` },
      { source: '/favicon.ico', destination: `${legacyAppOrigin}/favicon.ico` },
      { source: '/vite.svg', destination: `${legacyAppOrigin}/vite.svg` },
      {
        source: '/manifest.webmanifest',
        destination: `${legacyAppOrigin}/manifest.webmanifest`,
      },
      { source: '/robots.txt', destination: `${legacyAppOrigin}/robots.txt` },
    ];
  },
};

export default nextConfig;
