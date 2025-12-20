// apps/web/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 4000);
const BACKEND_TARGET =
  process.env.BACKEND_URL?.replace(/\/$/, '') || `http://localhost:${BACKEND_PORT}`;

export default defineConfig({
  plugins: [react()],

  resolve: {
    dedupe: [
      // 🔑 make sure these are singletons
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',

      // your existing ones
      'motion-dom',
      'react-native-web',
      'three',
      'firebase',
    ],
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.js', '.jsx', '.json'],
    alias: [
      // RN → web
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^react-native\/(.*)$/, replacement: 'react-native-web/dist/exports/$1' },

      // Monorepo shared
      { find: /^@shared$/, replacement: path.resolve(__dirname, '../../packages/shared/index.ts') },
      { find: /^@shared\/(.*)$/, replacement: path.resolve(__dirname, '../../packages/shared/$1') },
      {
        find: /^@mytutorapp\/shared$/,
        replacement: path.resolve(__dirname, '../../packages/shared/index.ts'),
      },
      {
        find: /^@mytutorapp\/shared\/(.*)$/,
        replacement: path.resolve(__dirname, '../../packages/shared/$1'),
      },

      {
        find: /^react-toastify$/,
        replacement: path.resolve(__dirname, 'node_modules/react-toastify'),
      },

      // ✅ explicit types barrel
      {
        find: /^@mytutorapp\/shared\/types$/,
        replacement: path.resolve(__dirname, '../../packages/shared/types/index.ts'),
      },
      {
        find: /^@shared\/types$/,
        replacement: path.resolve(__dirname, '../../packages/shared/types/index.ts'),
      },

      // App-local alias
      { find: '@', replacement: path.resolve(__dirname, 'src') },

      { find: 'three', replacement: path.resolve(__dirname, 'node_modules/three') },
    ],
  },
  optimizeDeps: {
    include: ['framer-motion', 'motion-dom', 'react-native-web', '@tanstack/react-query'],
    exclude: ['react-native', 'three'],
  },

  // If you want to import .glb without ?url, uncomment:
  // assetsInclude: ['**/*.glb', '**/*.gltf'],

  css: { devSourcemap: true },

  build: {
    sourcemap: true,
    cssCodeSplit: true,
    // Use Vite's default (esbuild) minifier; Terser can break three/drei.
    // minify: 'esbuild', // optional; default is fine
  },

  server: {
    port: 5173,
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../../packages/shared')],
    },
    proxy: {
      '/api': { target: BACKEND_TARGET, changeOrigin: true, secure: false },
      '/socket.io': { target: BACKEND_TARGET, ws: true, changeOrigin: true, secure: false },
    },
  },
});
