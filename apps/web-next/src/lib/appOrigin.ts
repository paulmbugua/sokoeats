// apps/web-next/src/lib/appOrigin.ts

export const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || 'https://app.daybreaklearner.com';

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
