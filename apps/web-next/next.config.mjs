import path from 'path';
import { fileURLToPath } from 'url';

/** Needed because __dirname doesn't exist in ESM */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@mytutorapp/shared'],

  turbopack: {
    resolveAlias: {
      '@': path.resolve(__dirname, 'src'),
      'react-router-dom': path.resolve(__dirname, 'src/lib/react-router-dom'),
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
};

export default nextConfig;
