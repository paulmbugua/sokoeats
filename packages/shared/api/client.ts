export const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || 'http://localhost:4005';
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