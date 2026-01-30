import path from 'path';
import { fileURLToPath } from 'url';

/** Needed because __dirname doesn't exist in ESM */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  transpilePackages: ['@mytutorapp/shared'],

  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@': path.resolve(__dirname, 'src'),
      'react-router-dom': path.resolve(__dirname, 'src/lib/react-router-dom'),
      'react-native$': 'react-native-web',
      'react-native/Libraries/Utilities/Platform':
        'react-native-web/dist/exports/Platform',
    };

    config.resolve.extensions = [
      '.web.tsx',
      '.web.ts',
      '.web.js',
      ...config.resolve.extensions,
    ];

    return config;
  },
};

export default nextConfig;
