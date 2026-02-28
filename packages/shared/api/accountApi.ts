// packages/shared/api/accountApi.ts
import axios from 'axios';
import type {
  SessionFormData,
  EarningsSummary,
  Transaction,
  Payout,
} from '@myhandymanapp/shared/types';

const cleaned = (u: string) => u.replace(/\/+$/, '');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** User + Profile (profile 404 → safe empty shape) */
export const fetchAccountDetails = async (
  backendUrl: string,
  token: string
): Promise<{ user: any; profile: any }> => {
  const base = cleaned(backendUrl);

  // Always get user; if this 401s, bubble up (the hook is token-gated)
  const userResponse = await axios.get(`${base}/api/user/me`, {
    headers: auth(token),
  });

  // Profile may not exist yet → 404; return safe empty shape
  let profileData: any = { profileExists: false, profile: {} };
  try {
    const profileResponse = await axios.get(`${base}/api/profile/me`, {
      headers: auth(token),
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404 || s === 401,
    });
    if (profileResponse.status === 200) {
      profileData = profileResponse.data;
    }
  } catch {
    // keep default safe profileData
  }

  return { user: userResponse.data, profile: profileData };
};

export const fetchTransactions = async (
  backendUrl: string,
  token: string
): Promise<Transaction[]> => {
  const base = cleaned(backendUrl);
  try {
    const { data } = await axios.get(`${base}/api/payment/transactions`, {
      headers: auth(token),
    });
    return Array.isArray(data?.data) ? (data.data as Transaction[]) : [];
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && [401, 403, 404].includes(err.response?.status ?? 0)) {
      return [];
    }
    throw err;
  }
};

export const fetchUpdatedTokenBalance = async (
  backendUrl: string,
  token: string
): Promise<number> => {
  const base = cleaned(backendUrl);
  const { data } = await axios.get(`${base}/api/user/me`, { headers: auth(token) });
  return Number(data?.tokens ?? 0);
};

export const fetchSessionsByType = async (
  backendUrl: string,
  token: string,
  type: string
): Promise<any[]> => {
  const base = cleaned(backendUrl);
  try {
    const { data } = await axios.get(`${base}/api/tutor-session/${type}`, {
      headers: auth(token),
      validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 403 || s === 404,
    });
    if (data == null) return [];
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err: unknown) {
    if (axios.isAxiosError(err) && [401, 403, 404].includes(err.response?.status ?? 0)) {
      return [];
    }
    throw err;
  }
};

// (mutations unchanged)
export const acceptSession = async (backendUrl: string, token: string, sessionId: string) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.put(
    `${base}/api/tutor-session/${sessionId}/accept`,
    {},
    { headers: auth(token) }
  );
  return data;
};

export const cancelSession = async (
  backendUrl: string,
  token: string,
  sessionId: string,
  reason: string
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.put(
    `${base}/api/tutor-session/${sessionId}/cancel`,
    { reason },
    { headers: auth(token) }
  );
  return data;
};

export const completePendingSession = async (
  backendUrl: string,
  token: string,
  sessionId: string
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.put(
    `${base}/api/tutor-session/session/complete-pending`,
    { sessionId },
    { headers: auth(token) }
  );
  return data;
};

export const confirmSessionCompletion = async (
  backendUrl: string,
  token: string,
  sessionId: string
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.put(
    `${base}/api/tutor-session/session/confirm-completion`,
    { sessionId },
    { headers: auth(token) }
  );
  return data;
};

export const submitReview = async (
  backendUrl: string,
  token: string,
  reviewData: { tutorId: string; sessionId?: string; comment: string; rating: number }
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.post(`${base}/api/reviews`, reviewData, {
    headers: auth(token),
  });
  return data;
};

export const createSession = async (
  backendUrl: string,
  token: string,
  formData: SessionFormData
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.post(`${base}/api/tutor-session/session/create`, formData, {
    headers: auth(token),
  });
  return data;
};

export const createZoomLink = async (
  backendUrl: string,
  token: string,
  sessionId: string,
  topic: string,
  startTime: string,
  duration: number,
  tutorName: string
) => {
  const base = cleaned(backendUrl);
  const { data } = await axios.post(
    `${base}/api/tutor-session/create-zoom-link`,
    { sessionId, topic, startTime, duration, tutorName },
    { headers: auth(token) }
  );
  return data;
};

export const fetchEarningsSummary = async (
  backendUrl: string,
  token: string
): Promise<EarningsSummary> => {
  const base = cleaned(backendUrl);
  const url = `${base}/api/earnings/summary`;

  // Accept 401/403/404 so axios doesn't throw
  const res = await axios.get(url, {
    headers: auth(token),
    validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 403 || s === 404,
  });

  if (res.status !== 200) {
    // Quiet fallback for not-authorized / not-available
    return { total: 0, pending: 0, available: 0, currency: 'USD' };
  }

  const data = res.data;
  const firstBalance = data?.balances?.[0] ?? {
    available_amount: 0,
    pending_amount: 0,
    currency: 'USD',
  };

  return {
    total: Number(data?.lifetime?.[0]?.total ?? 0),
    pending: Number(firstBalance?.pending_amount ?? 0),
    available: Number(firstBalance?.available_amount ?? 0),
    currency: String(firstBalance?.currency ?? 'USD'),
  };
};

export const fetchEarningsTransactions = async (
  backendUrl: string,
  token: string
): Promise<Transaction[]> => {
  const base = cleaned(backendUrl);
  const res = await axios.get(`${base}/api/earnings/transactions`, {
    headers: auth(token),
    validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 403 || s === 404,
  });
  if (res.status !== 200) return [];
  const data = res.data;
  return Array.isArray(data?.data) ? (data.data as Transaction[]) : [];
};

export const fetchEarningsPayouts = async (
  backendUrl: string,
  token: string
): Promise<Payout[]> => {
  const base = cleaned(backendUrl);
  const res = await axios.get(`${base}/api/earnings/payouts`, {
    headers: auth(token),
    validateStatus: (s) => (s >= 200 && s < 300) || s === 401 || s === 403 || s === 404,
  });
  if (res.status !== 200) return [];
  const data = res.data;
  return Array.isArray(data?.data) ? (data.data as Payout[]) : [];
};
