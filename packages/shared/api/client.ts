function readViteEnv(name: string) {
  return typeof import.meta !== 'undefined' ? String((import.meta as any).env?.[name] || '') : '';
}

function defaultApiBase() {
  const configured = readViteEnv('VITE_API_URL') || readViteEnv('VITE_BACKEND_URL') || readViteEnv('EXPO_PUBLIC_BACKEND_URL') || readViteEnv('EXPO_PUBLIC_LAN_BACKEND_URL');
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.hostname) return 'http://' + window.location.hostname + ':4000';
  return 'http://localhost:4000';
}

export const API_BASE = defaultApiBase();
const AUTH_KEY = 'sokoeats.auth';

export type StoredAuthSession = {
  token: string;
  expiresAt: string;
  user: { id: string; name: string; email: string; role: string; status?: string; avatarUrl?: string; profile?: Record<string, unknown> };
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
  if (!res.ok) throw new Error(data.message || 'Sokoeats request failed');
  return data as T;
}
