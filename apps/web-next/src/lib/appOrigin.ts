// apps/web-next/src/lib/appOrigin.ts

import { publicEnv } from './env';

const APP_MOUNT = '/app';

const normalizePath = (p: string) => {
  const path = String(p || '').trim();
  if (!path) return '';
  return path.startsWith('/') ? path : `/${path}`;
};

export const appUrl = (path: string) => {
  const p = normalizePath(path);

  // ✅ always return same-origin /app/* so users stay on www
  return `${APP_MOUNT}${p}`;
};
