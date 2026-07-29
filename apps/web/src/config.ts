const PRODUCTION_BACKEND_URL = 'https://server.ekazi.co.ke';
const IS_DEV = Boolean(import.meta.env.DEV);

function cleanUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLocalUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
}

function localBackendUrl(): string {
  return ['http://localhost', '4005'].join(':');
}

export function resolveBackendUrl(): string {
  const runtimeEnv = typeof window !== 'undefined' ? ((window as any).__EKAZI_ENV__ || {}) : {};
  const candidates = [
    runtimeEnv.VITE_BACKEND_URL,
    runtimeEnv.VITE_API_URL,
    typeof window !== 'undefined' ? (window as any).__BACKEND_URL__ : '',
  ];

  for (const candidate of candidates) {
    const url = cleanUrl(candidate);
    if (!url) continue;
    if (!IS_DEV && isLocalUrl(url)) continue;
    return url;
  }

  return IS_DEV ? localBackendUrl() : PRODUCTION_BACKEND_URL;
}

export const API_BASE = resolveBackendUrl();
