// apps/web-next/src/lib/appOrigin.ts

const PROD_APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || 'https://app.daybreaklearner.com';

// In dev we proxy legacy app under /app/*
const DEV_APP_MOUNT = '/app';

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

const normalizePath = (p: string) => {
  const path = String(p || '').trim();
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
};

export const appUrl = (path: string) => {
  const p = normalizePath(path);

  // ✅ dev: same-origin relative URL so Next rewrites can proxy it
  if (process.env.NODE_ENV === 'development') {
    return `${DEV_APP_MOUNT}${p}`; // e.g. /app/robot-teach
  }

  // ✅ prod: go to legacy app domain
  return `${normalizeOrigin(PROD_APP_ORIGIN)}${p}`;
};
