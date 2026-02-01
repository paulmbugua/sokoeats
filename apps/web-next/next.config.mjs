import path from 'path';
import { fileURLToPath } from 'url';

/** Needed because __dirname doesn't exist in ESM */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reactQueryPath = path.resolve(__dirname, '../../node_modules/@tanstack/react-query');
const queryCorePath = path.resolve(__dirname, '../../node_modules/@tanstack/query-core');
const legacyAppOrigin =
  process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN || 'http://localhost:5173';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@mytutorapp/shared'],

  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname, 'src'),
      'react-native$': 'react-native-web',
      'react-native/Libraries/Utilities/Platform':
        'react-native-web/dist/exports/Platform',
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
    };
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
      { source: '/courses/:path+', destination: '/app/courses/:path*', permanent: false },
      { source: '/class-vault/:path*', destination: '/app/class-vault/:path*', permanent: false },
      { source: '/progress/:path*', destination: '/app/progress/:path*', permanent: false },
      { source: '/results', destination: '/app/results', permanent: false },
    ];
  },
  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      {
        source: '/app/:path*',
        destination: `${legacyAppOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
