import path from 'path';
import { fileURLToPath } from 'url';

/** Needed because __dirname doesn't exist in ESM */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const reactQueryPath = path.resolve(__dirname, '../../node_modules/@tanstack/react-query');
const queryCorePath = path.resolve(__dirname, '../../node_modules/@tanstack/query-core');

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
};

export default nextConfig;
