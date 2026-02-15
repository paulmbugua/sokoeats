// apps/web-next/src/lib/appOrigin.ts
import { publicEnv } from './env';

export const APP_MOUNT = '/app';

const isAbs = (s: string) => /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(s);

function normalizeToPathish(input: string): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';

  // query/hash only
  if (raw.startsWith('?') || raw.startsWith('#')) return raw;

  // strip origin if absolute URL is passed
  if (isAbs(raw)) {
    try {
      const u = new URL(raw);
      const out = `${u.pathname || ''}${u.search || ''}${u.hash || ''}`.trim();
      return out.startsWith('/') ? out : `/${out}`;
    } catch {
      // fall through
    }
  }

  return raw.startsWith('/') ? raw : `/${raw}`;
}

function mountUnder(prefix: string, input: string): string {
  const pfx = String(prefix || '').trim().replace(/\/+$/, '');
  const norm = normalizeToPathish(input);

  if (!pfx) return norm || '/';
  if (!norm) return pfx;

  // query/hash only -> attach to mount root
  if (norm.startsWith('?') || norm.startsWith('#')) return `${pfx}${norm}`;

  const m = norm.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  const pathname = (m?.[1] || '/').replace(/\/+$/, '');
  const search = m?.[2] || '';
  const hash = m?.[3] || '';

  const pn = pathname.startsWith('/') ? pathname : `/${pathname}`;

  if (pn === pfx || pn.startsWith(`${pfx}/`)) return `${pn}${search}${hash}`;
  return `${pfx}${pn}${search}${hash}`;
}

/** web-next canonical routes (NO /app prefix) */
export function siteUrl(path: string): string {
  const norm = normalizeToPathish(path);
  if (!norm) return '/';
  if (norm.startsWith('?') || norm.startsWith('#')) return `/${norm}`;
  return norm;
}

/** legacy app mounted under /app (apps/web) */
export function appUrl(path: string): string {
  return mountUnder(APP_MOUNT, path);
}

/** (optional) absolute helpers, env-only so SSR-safe */
export function absoluteSiteUrl(path: string): string {
  const origin = String(publicEnv?.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const rel = siteUrl(path);
  return origin ? `${origin}${rel}` : rel;
}

export function absoluteAppUrl(path: string): string {
  const origin = String(publicEnv?.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  const rel = appUrl(path);
  return origin ? `${origin}${rel}` : rel;
}