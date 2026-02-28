// packages/shared/api/profileApi.ts
import axios from 'axios';
import type { Profile, UserProfileResponse, ProfilePayload } from '@myhandymanapp/shared/types';

const dev = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;

/** Create a profile from a pure JSON payload. */
export const createProfileJson = async (
  backendUrl: string,
  token: string,
  payload: ProfilePayload
) => {
  const url = `${backendUrl}/api/profile/json`;
  return axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

/** Fetch the logged‐in user’s role */
export const fetchUserRole = async (backendUrl: string, token: string): Promise<string> => {
  if (!token) throw new Error('fetchUserRole: missing token');
  const url = `${backendUrl}/api/user/me`;
  const response = await axios.get<{ success: boolean; role: string }>(url, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (s) => (s >= 200 && s < 300) || s === 401,
  });
  if (response.status === 401) throw new Error('Unauthorized');
  if (response.data.success) return response.data.role;
  throw new Error(`Failed to fetch user role: ${JSON.stringify(response.data)}`);
};

/** Fetch all tutor profiles (404 → []) */

export const fetchTutorProfiles = async (backendUrl: string): Promise<Profile[]> => {
  const base = (backendUrl || '').replace(/\/+$/, '');

  // Try the correct (singular) route first
  const tryOnce = async (url: string) => {
    try {
      const res = await axios.get<{ success?: boolean; profiles?: Profile[] }>(url, {
        withCredentials: false,
        timeout: 10000,
        validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
      });
      if (res.status === 404) return { ok: false as const, data: [] as Profile[] };
      const list = Array.isArray(res.data?.profiles) ? res.data.profiles : [];
      return { ok: true as const, data: list };
    } catch {
      return { ok: false as const, data: [] as Profile[] };
    }
  };

  const singular = `${base}/api/profile?public=1&limit=48`;
  const first = await tryOnce(singular);
  if (first.ok)
    return first.data.filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor');

  // Fallback to plural only if singular failed (handles future remounts)
  const plural = `${base}/api/profiles?public=1&limit=48`;
  const second = await tryOnce(plural);
  return second.data.filter((p: any) => String(p?.role || '').toLowerCase() === 'tutor');
};

/** Fetch the current user's full profile (404 → null, not an error) */
export const fetchUserProfile = async (
  backendUrl: string,
  token: string
): Promise<UserProfileResponse['profile'] | null> => {
  if (!token) return null;
  const url = `${backendUrl}/api/profile/me`;
  const response = await axios.get<UserProfileResponse>(url, {
    headers: { Authorization: `Bearer ${token}` },
    validateStatus: (s) => (s >= 200 && s < 300) || s === 404 || s === 401,
  });

  if (response.status === 404) {
    if (dev) console.debug('[profile/me] 404 → null profile');
    return null;
  }
  if (response.status === 401) {
    if (dev) console.debug('[profile/me] 401 → null profile');
    return null;
  }

  if (dev) {
    console.debug('fetchUserProfile full data:', response.data);
    console.debug('fetchUserProfile.profile:', response.data.profile);
  }
  return response.data.profile ?? null;
};

export const updateProfileVideoJson = async (
  backendUrl: string,
  token: string,
  body: { video: string }
) => {
  const url = `${backendUrl}/api/profile/video`;
  return axios.patch(url, body, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};

export async function searchTutorsApi(backendUrl: string, params: Record<string, any>) {
  const base = (backendUrl || '').replace(/\/+$/, '');
  const { data } = await axios.get(`${base}/api/profile/search`, { params });
  return data;
}
