import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reactQueryPath = path.resolve(__dirname, '../../node_modules/@tanstack/react-query');
const queryCorePath = path.resolve(__dirname, '../../node_modules/@tanstack/query-core');

// ✅ Your legacy app (production)
const LEGACY_PROD_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || 'https://app.daybreaklearner.com';

// ✅ Your local legacy vite server (development)
const LEGACY_DEV_ORIGIN =
  process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN?.trim() || 'http://localhost:5173';

const normalizeOrigin = (o) => String(o || '').replace(/\/+$/, '');
const LEGACY_PROD = normalizeOrigin(LEGACY_PROD_ORIGIN);
const LEGACY_DEV = normalizeOrigin(LEGACY_DEV_ORIGIN);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@mytutorapp/shared'],

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

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@tanstack/react-query': reactQueryPath,
      '@tanstack/query-core': queryCorePath,
      '@': path.resolve(__dirname, 'src'),
      'react-native$': 'react-native-web',
      'react-native/Libraries/Utilities/Platform': 'react-native-web/dist/exports/Platform',
    };
    return config;
  },

  /**
   * ✅ Redirect legacy routes from www -> app domain (PROD)
   * ✅ In dev, keep them inside /app/* so proxy works
   */
  async redirects() {
    const isDev = process.env.NODE_ENV === 'development';
    const dest = (p) => (isDev ? `/app${p}` : `${LEGACY_PROD}${p}`);

    return [
      // legacy public routes
      { source: '/robot-teach', destination: dest('/robot-teach'), permanent: false },
      { source: '/login', destination: dest('/login'), permanent: false },

      // org routes
      { source: '/org', destination: dest('/org'), permanent: false },
      { source: '/org/login', destination: dest('/org/login'), permanent: false },

      // other legacy routes
      { source: '/messages', destination: dest('/messages'), permanent: false },
      { source: '/settings/:path*', destination: dest('/settings/:path*'), permanent: false },
      { source: '/courses/:path*', destination: dest('/courses/:path*'), permanent: false },
      { source: '/class-vault/:path*', destination: dest('/class-vault/:path*'), permanent: false },
      { source: '/progress/:path*', destination: dest('/progress/:path*'), permanent: false },
      { source: '/results', destination: dest('/results'), permanent: false },
    ];
  },

  /**
   * ✅ Dev-only proxy so you can run:
   * - Next on :3000
   * - Vite legacy on :5173
   * and mount it under /app/*
   *
   * IMPORTANT: Vite should run with base="/app/" (VITE_BRIDGED=1)
   */
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [{ source: '/app/:path*', destination: `${LEGACY_DEV}/:path*` }];
  },
};

export default nextConfig;
