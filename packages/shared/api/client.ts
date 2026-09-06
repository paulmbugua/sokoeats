declare const process: { env: Record<string, string | undefined> } | undefined;

function readViteEnv(name: string) {
  return typeof import.meta !== 'undefined' ? String((import.meta as any).env?.[name] || '') : '';
}

function defaultApiBase() {
  const nextConfigured = typeof process !== 'undefined'
    ? process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || ''
    : '';
  const configured = nextConfigured || readViteEnv('VITE_API_URL') || readViteEnv('VITE_BACKEND_URL') || readViteEnv('EXPO_PUBLIC_BACKEND_URL') || readViteEnv('EXPO_PUBLIC_LAN_BACKEND_URL');
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname) {
    const apiHost = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    return 'http://' + apiHost + ':4000';
  }
  return 'http://localhost:4000';
}

export const API_BASE = defaultApiBase();
const AUTH_KEY = 'sokoeats.auth';

export type StoredAuthSession = {
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string; role: string; status?: string; applicationReference?: string | null; avatarUrl?: string; phone?: string | null; city?: string | null; defaultAddress?: string | null; profileComplete?: boolean; termsAccepted?: boolean; termsVersion?: string | null; missingProfileFields?: string[]; profile?: Record<string, unknown> };
};

export function readAuthSession(): StoredAuthSession | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function readAuthToken() {
  return readAuthSession()?.token || '';
}

export function saveAuthSession(session: StoredAuthSession) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
}

export function clearAuthSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(AUTH_KEY);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = readAuthToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token && typeof window !== 'undefined') {
      clearAuthSession();
      window.dispatchEvent(new CustomEvent('sokoeats:session-expired', {
        detail: { message: data.message || 'Your session has expired. Please sign in again.' },
      }));
    }
    const details = res.status === 422 && Array.isArray(data.details)
      ? data.details.filter((detail: unknown): detail is string => typeof detail === 'string').join('; ')
      : '';
    throw new Error(details ? `${data.message || 'Validation failed'}: ${details}` : data.message || 'Sokoeats request failed');
  }
  return data as T;
}
