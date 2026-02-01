// apps/web-next/src/lib/appOrigin.ts

import { SITE_URL } from '@/lib/site';

const resolveBaseOrigin = () => {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim();
  if (configuredOrigin) return configuredOrigin;
  if (typeof window !== 'undefined') return window.location.origin;
  return SITE_URL;
};

const ensureAppPath = (origin: string) => {
  const trimmed = origin.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  return trimmed.endsWith('/app') ? trimmed : `${trimmed}/app`;
};

export const APP_ORIGIN = ensureAppPath(resolveBaseOrigin());

const normalizeOrigin = (origin: string) => origin.replace(/\/+$/, '');

const normalizePath = (path: string) => {
  const [pathPart, hash] = path.split('#');
  const [pathnameRaw, query] = pathPart.split('?');
  const pathname = pathnameRaw.startsWith('/') ? pathnameRaw : `/${pathnameRaw}`;
  const normalizedPath = pathname.replace(/\/{2,}/g, '/');
  const queryString = query ? `?${query}` : '';
  const hashString = hash ? `#${hash}` : '';
  return `${normalizedPath}${queryString}${hashString}`;
};

export const appUrl = (path: string) => {
  if (!path) return normalizeOrigin(APP_ORIGIN);
  return `${normalizeOrigin(APP_ORIGIN)}${normalizePath(path)}`;
};
