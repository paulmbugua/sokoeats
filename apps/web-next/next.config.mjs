// apps/web-next/next.config.mjs
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const normalizeOrigin = (value) => {
  const raw = (value || '').toString().trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return raw.replace(/\/+$/, '');
  }
};

const resolveLegacyAppOrigin = () => {
  const legacy = normalizeOrigin(process.env.NEXT_PUBLIC_LEGACY_APP_ORIGIN);
  if (legacy) return legacy;

  const appOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_APP_ORIGIN);
  if (appOrigin) return appOrigin;

  return 'http://localhost:5173';
};

const legacyAppOrigin = resolveLegacyAppOrigin();

if (process.env.NODE_ENV === 'development') {
  console.info(`[web-next] legacy proxy target: ${legacyAppOrigin}`);
}

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
    resolveExtensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  },

  async redirects() {
    return [
      // ---------------------------------------------------------------------
      // ✅ Canonical web-next auth + landings (avoid legacy "Redirecting..." shims)
      // ---------------------------------------------------------------------
      { source: '/app/login', destination: '/login', permanent: false },
      { source: '/app/signup', destination: '/signup', permanent: false },
      { source: '/app/institutions/login', destination: '/institutions/login', permanent: false },
      { source: '/app/institutions', destination: '/institutions', permanent: false },
      { source: '/app/find-tutor', destination: '/find-tutor', permanent: true },
      { source: '/app/resources', destination: '/resources', permanent: true },
      { source: '/app/org/login/:path*', destination: '/institutions', permanent: true },
      { source: '/app/profile/me', destination: '/profile/me', permanent: false },
      { source: '/app/courses', destination: '/courses', permanent: false },
      { source: '/app/courses/:courseId', destination: '/courses/:courseId', permanent: false },

      // RobotTeacher canonical landing is web-next now
      { source: '/robot-teach', destination: '/robot-teacher', permanent: false },

      // Legacy aliases you already had
      { source: '/institution', destination: '/institutions', permanent: false },
      { source: '/institution/login', destination: '/institutions/login', permanent: false },
      { source: '/institution/:path*', destination: '/institutions/:path*', permanent: false },

      // Public policy short-links used in trust surfaces
      { source: '/privacy', destination: '/privacy-policy', permanent: false },
      { source: '/anti-spam', destination: '/anti-spam-policy', permanent: false },
      { source: '/complaints', destination: '/complaints-feedback', permanent: false },

      // ---------------------------------------------------------------------
      // ✅ Keep legacy app (apps/web) mounted under /app/*
      // These are "pretty" routes that should continue to jump into /app/*
      // ---------------------------------------------------------------------
      { source: '/org', destination: '/app/org', permanent: false },
      { source: '/messages', destination: '/app/messages', permanent: false },
      { source: '/settings/:path*', destination: '/app/settings/:path*', permanent: false },
      { source: '/class-vault/:path*', destination: '/app/class-vault/:path*', permanent: false },
      { source: '/progress/:path*', destination: '/app/progress/:path*', permanent: false },
      { source: '/results', destination: '/app/results', permanent: false },

      // ---------------------------------------------------------------------
      // ✅ IMPORTANT: Profile is being moved to web-next
      // So DO NOT redirect /profile/* into /app/profile/*
      // (Removed: { source: '/profile/:path*', destination: '/app/profile/:path*', permanent: false })
      // ---------------------------------------------------------------------
    ];
  },

  async rewrites() {
    if (process.env.NODE_ENV !== 'development') return [];

    // ✅ IMPORTANT:
    // The legacy Vite app is built with base "/" on the app subdomain.
    // When Next serves "/app/*", proxy to legacy WITHOUT the "/app" prefix.
    return [
      // Legacy app mounted under /app/*
      { source: '/app/:path*', destination: `${legacyAppOrigin}/:path*` },

      // Also proxy Vite runtime/module paths if they appear at root (some setups do)
      { source: '/@vite/:path*', destination: `${legacyAppOrigin}/@vite/:path*` },
      { source: '/@react-refresh', destination: `${legacyAppOrigin}/@react-refresh` },
      { source: '/src/:path*', destination: `${legacyAppOrigin}/src/:path*` },
      { source: '/assets/:path*', destination: `${legacyAppOrigin}/assets/:path*` },

      // Vite dev can request these directly (esp. monorepos / optimizeDeps)
      { source: '/@fs/:path*', destination: `${legacyAppOrigin}/@fs/:path*` },
      { source: '/node_modules/:path*', destination: `${legacyAppOrigin}/node_modules/:path*` },

      // common public files
      { source: '/favicon.ico', destination: `${legacyAppOrigin}/favicon.ico` },
      { source: '/robots.txt', destination: `${legacyAppOrigin}/robots.txt` },
      { source: '/manifest.webmanifest', destination: `${legacyAppOrigin}/manifest.webmanifest` },
      { source: '/vite.svg', destination: `${legacyAppOrigin}/vite.svg` },
    ];
  },

  async headers() {
    const securityHeaders = [
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      },
    ];

    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/image',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, s-maxage=3600, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
