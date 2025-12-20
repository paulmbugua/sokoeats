// apps/admin/vite.config.ts
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
      // 🔑 singletons
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@tanstack/react-query-devtools',

      // keep in sync with web (minus firebase)
      'motion-dom',
      'react-native-web',
      'three',
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

      // explicit types barrel (matches web)
      {
        find: /^@mytutorapp\/shared\/types$/,
        replacement: path.resolve(__dirname, '../../packages/shared/types/index.ts'),
      },
      {
        find: /^@shared\/types$/,
        replacement: path.resolve(__dirname, '../../packages/shared/types/index.ts'),
      },

      // pin toastify to app-local (matches web)
      {
        find: /^react-toastify$/,
        replacement: path.resolve(__dirname, 'node_modules/react-toastify'),
      },

      // App-local alias
      { find: '@', replacement: path.resolve(__dirname, 'src') },

      // Optional pin for three (matches web)
      { find: 'three', replacement: path.resolve(__dirname, 'node_modules/three') },
    ],
  },

  optimizeDeps: {
    include: ['framer-motion', 'motion-dom', 'react-native-web', '@tanstack/react-query'],
    // ⛔ explicitly exclude firebase to avoid accidental prebundle
    exclude: ['react-native', 'three', 'firebase', 'firebase/app', 'firebase/auth'],
  },

  css: { devSourcemap: true },

  build: {
    sourcemap: true,
    cssCodeSplit: true,
  },

  server: {
    port: 5174, // avoid clashing with web (5173)
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, '../../packages/shared')],
    },
    proxy: {
      '/api': { target: BACKEND_TARGET, changeOrigin: true, secure: false },
      '/socket.io': { target: BACKEND_TARGET, ws: true, changeOrigin: true, secure: false },
    },
  },
});
