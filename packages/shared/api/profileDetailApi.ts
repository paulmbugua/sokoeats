// packages/shared/api/profileDetailApi.ts
import axios, { AxiosError } from 'axios';

export const getTutorProfile = async (backendUrl: string, token: string, tutorId: string) => {
  const base = backendUrl.replace(/\/$/, '');

  try {
    const response = await axios.get(`${base}/api/profile/user/${tutorId}`, {
      headers: token
        ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' },
      timeout: 10000,
      validateStatus: (s) => s >= 200 && s < 300, // keep default strictness
    });

    return response.data;
  } catch (err) {
    const error = err as AxiosError;

    // ✅ Expected in your setup (you fallback to /api/profile/:id)
    if (error.response?.status === 404) {
      console.log('ℹ️ [API Debug] /api/profile/user/:id returned 404 (will fallback)', {
        tutorId,
        url: `${base}/api/profile/user/${tutorId}`,
      });
      throw error; // let caller fallback
    }

    // ✅ Real errors worth showing loudly
    console.error('❌ [API Debug] Failed to fetch profile:', {
      tutorId,
      url: `${base}/api/profile/user/${tutorId}`,
      errorMessage: error.message,
      responseStatus: error.response?.status,
      responseData: error.response?.data,
      code: error.code,
    });

    throw error;
  }
};
