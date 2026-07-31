const PRODUCTION_BACKEND_URL = 'https://server.ekazi.co.ke';
const IS_DEV = Boolean(import.meta.env.DEV);

function cleanUrl(value: unknown): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLocalUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(value);
}

function localBackendUrl(): string {
  return ['http://localhost', '4000'].join(':');
}

export function resolveBackendUrl(): string {
  const runtimeEnv = typeof window !== 'undefined' ? ((window as any).__EKAZI_ENV__ || {}) : {};
  const buildEnvUrl = cleanUrl(import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL);

  if (IS_DEV) {
    // Vite serves public/env.js locally too, but that file is production-oriented for Cloudflare.
    // In local development, prefer an explicit Vite env URL or the local backend.
    return buildEnvUrl || localBackendUrl();
  }

  const candidates = [
    buildEnvUrl,
    runtimeEnv.VITE_BACKEND_URL,
    runtimeEnv.VITE_API_URL,
    typeof window !== 'undefined' ? (window as any).__BACKEND_URL__ : '',
  ];

  for (const candidate of candidates) {
    const url = cleanUrl(candidate);
    if (!url || isLocalUrl(url)) continue;
    return url;
  }

  return PRODUCTION_BACKEND_URL;
}

export const API_BASE = resolveBackendUrl();
