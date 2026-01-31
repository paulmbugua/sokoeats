// apps/web-next/src/lib/appOrigin.ts

export const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || 'https://app.daybreaklearner.com';

// Local dev override (so clicking goes to Vite dev server)
export const APP_ORIGIN_DEV =
  process.env.NEXT_PUBLIC_APP_ORIGIN_DEV?.trim() || APP_ORIGIN;

/**
 * In production: return a path ("/login") so Netlify redirects can proxy to Vite.
 * In development: return absolute URL ("http://localhost:5173/login") to avoid Next 404s.
 */
export const appUrl = (path: string) => {
  if (process.env.NODE_ENV === 'development') {
    return `${APP_ORIGIN_DEV}${path.startsWith('/') ? '' : '/'}${path}`;
  }
  return path.startsWith('/') ? path : `/${path}`;
};
