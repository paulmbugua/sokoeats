// authApi.ts
import axios from 'axios';
import type {
  AuthPayload,
  RegisterPayload,
  UpdateRolePayload,
  AuthResponse,
} from '@myhandymanapp/shared/types';

// Optional: a single axios instance so headers/credentials are consistent
function client(backendUrl: string, token?: string) {
  return axios.create({
    baseURL: backendUrl,
    withCredentials: true, // important if backend uses cookies/sessions
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

const toMessage = (err: any) =>
  err?.response?.data?.message ||
  err?.response?.data?.error ||
  (typeof err?.response?.data === 'string' ? err.response.data : '') ||
  err?.message ||
  'Request failed';

// --- Google login stays mostly same but add withCredentials for cookies
export const googleLogin = async (
  backendUrl: string,
  credential: string
): Promise<AuthResponse> => {
  try {
    const api = client(backendUrl);
    const res = await api.post<AuthResponse>('/api/user/google-login', { token: credential });
    return res.data;
  } catch (err: any) {
    console.error('🔴 [googleLogin] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
};

export const login = async (
  backendUrl: string,
  payload: AuthPayload,
  token?: string
): Promise<AuthResponse> => {
  try {
    const api = client(backendUrl, token);
    const p = {
      // normalize/trim to avoid failing server validators
      email: payload.email?.trim(),
      password: payload.password ?? '',
    };
    const res = await api.post<AuthResponse>('/api/user/login', p);
    return res.data;
  } catch (err: any) {
    console.error('🔴 [login] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
};

export const register = async (
  backendUrl: string,
  payload: RegisterPayload,
  token?: string
): Promise<AuthResponse> => {
  const api = client(backendUrl, token);

  // >>> log what we send
  try {
    console.log('[register] payload →', JSON.stringify(payload));
  } catch {}

  try {
    const res = await api.post<AuthResponse>('/api/user/register', payload);
    return res.data;
  } catch (err: any) {
    console.error('🔴 [register] status:', err.response?.status);
    console.error('🔴 [register] data:', err.response?.data);
    throw new Error(toMessage(err));
  }
};

export const requestOTP = async (
  backendUrl: string,
  email: string,
  token?: string
): Promise<AuthResponse> => {
  try {
    const api = client(backendUrl, token);
    const res = await api.post<AuthResponse>('/api/user/reset-password', { email: email?.trim() });
    return res.data;
  } catch (err: any) {
    console.error('🔴 [requestOTP] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
};

export const verifyOTP = async (
  backendUrl: string,
  email: string,
  otp: string,
  newPassword: string,
  token?: string
): Promise<AuthResponse> => {
  try {
    const api = client(backendUrl, token);
    const res = await api.post<AuthResponse>('/api/user/verify-otp', {
      email: email?.trim(),
      otp: otp?.trim(),
      newPassword,
    });
    return res.data;
  } catch (err: any) {
    console.error('🔴 [verifyOTP] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
};

export const updateRole = async (
  backendUrl: string,
  payload: UpdateRolePayload,
  token: string
): Promise<AuthResponse> => {
  try {
    const api = client(backendUrl, token);
    const res = await api.put<AuthResponse>('/api/user/update-role', payload);
    return res.data;
  } catch (err: any) {
    console.error('🔴 [updateRole] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
};

export async function deleteAccount(backendUrl: string, token: string): Promise<void> {
  try {
    const api = client(backendUrl, token);
    await api.delete<void>('/api/user/account');
  } catch (err: any) {
    console.error('🔴 [deleteAccount] status/data:', err.response?.status, err.response?.data);
    throw new Error(toMessage(err));
  }
}
