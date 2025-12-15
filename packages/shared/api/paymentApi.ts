// packages/shared/api/paymentApi.ts
import axios from 'axios';
import type { PaymentPackage } from '@mytutorapp/shared/types';


function clientPlatformHeader() {
  const isNative =
    typeof navigator !== 'undefined' && (navigator as any).product === 'ReactNative';
  return { 'x-client-platform': isNative ? 'native' : 'web' };
}


export const getPaymentPackages = async (
  backendUrl: string,
  token: string,
  currency?: 'USD' | 'KES'
): Promise<PaymentPackage[]> => {
  const url = new URL('/api/payment/packages', backendUrl);
  if (currency) url.searchParams.set('currency', currency);

  const response = await axios.get<PaymentPackage[]>(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  const packagesArray: PaymentPackage[] = Array.isArray(response.data) ? response.data : [];

  // Sort packages by credits ascending (or any custom order you want)
  return packagesArray.sort(
    (a, b) => Number(a.credits ?? 0) - Number(b.credits ?? 0)
  );
};

export const getRandomProfile = async (
  backendUrl: string,
  token: string
) => {
  const response = await axios.get(`${backendUrl}/api/profile/random`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return response.data;
};

export const getTutorReviews = async (
  backendUrl: string,
  token: string,
  tutorId: string
): Promise<{ avgRating: number; totalReviews: number }> => {
  const response = await axios.get(
    `${backendUrl}/api/reviews?tutorId=${encodeURIComponent(tutorId)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return {
    avgRating: response.data.avgRating,
    totalReviews: response.data.totalReviews,
  };
};

/* ───────────────────────── M-Pesa helpers ───────────────────────── */

export const initiatePayment = async (
  backendUrl: string,
  token: string,
  payload: { amount: number; packageId: string; paymentMethod: string; phone: string }
): Promise<{ transactionId?: string }> => {
  const response = await axios.post<{ transactionId?: string }>(
    `${backendUrl}/api/payment/initiate`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

export const completePayment = async (
  backendUrl: string,
  token: string,
  payload: { transactionReference: string }
) => {
  return axios.put(
    `${backendUrl}/api/payment/confirm`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );
};

export const updateMpesaReference = async (
  backendUrl: string,
  token: string,
  transactionReference: string,
  mpesaReference: string
): Promise<{ message: string }> => {
  const response = await axios.put<{ message: string }>(
    `${backendUrl}/api/payment/update-mpesa`,
    { transactionReference, mpesaReference },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return response.data;
};

/* ────────────────────── Paystack card charge (inline) ───────────────────── */

export interface PaystackCardDetails {
  number: string;      // may contain spaces, backend will strip
  exp_month: string;   // "01".."12" or "1".."12"
  exp_year: string;    // "2027" or "27" (backend normalises)
  cvc: string;
  name?: string;
}

export interface PaystackCardChargePayload {
  packageId: string | number;
  card: PaystackCardDetails;
  email?: string;      // optional override; backend falls back to user.email
}

export interface PaystackCardChargeResponse {
  ok?: boolean;
  status?: string;
  reference?: string;
  tokensBalance?: number;
  creditsPurchased?: number;
  requiresAction?: boolean;
  paystackStatus?: string;
  message?: string;
  raw?: unknown;
  paystack?: unknown;
}

/**
 * Inline card charge via Paystack: POST /api/paystack/card-charge
 * Backend:
 *   - creates payments row (PAYSTACK, Pending, USD)
 *   - calls Paystack /charge
 *   - on success, credits tokens + marks payment Completed
 */
export const paystackCardCharge = async (backendUrl: string, token: string, payload: any) => {
  const url = new URL('/api/paystack/card-charge', backendUrl).toString();
  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...clientPlatformHeader(), // ✅
    },
  });
  return res.data;
};

export const paystackSubmitOtp = async (backendUrl: string, token: string, payload: any) => {
  const url = new URL('/api/paystack/submit-otp', backendUrl).toString();
  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...clientPlatformHeader(), // ✅
    },
  });
  return res.data;
};


export type PaystackCreateOrderResp = {
  paymentId: number;
  reference: string;
  authorization_url: string;
  access_code?: string;
  // optional echoes
  priceUsd?: string;
  credits?: number;
  offer?: string;
};

export type PaystackVerifyResp = {
  ok: boolean;
  status: 'success' | 'pending' | 'failed' | string;
  tokensBalance?: number;
  creditsPurchased?: number;
  alreadyCompleted?: boolean;
  message?: string;
  raw?: unknown;
};

export const paystackCreateOrder = async (
  backendUrl: string,
  token: string,
  payload: { packageId: string | number }
): Promise<PaystackCreateOrderResp> => {
  const url = new URL('/api/paystack/create-order', backendUrl).toString();
  const res = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...clientPlatformHeader(), // ✅ ADD THIS
    },
  });
  return res.data;
};


// If you kept verify protected, token is required; if you removed anyAuth, token can be optional.
export const paystackVerify = async (
  backendUrl: string,
  reference: string,
  token?: string
): Promise<PaystackVerifyResp> => {
  const url = new URL(`/api/paystack/verify/${encodeURIComponent(reference)}`, backendUrl).toString();
  const res = await axios.get(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  return res.data;
};

// Optional: use your existing wallet/me endpoint if you have one.
// Replace endpoint if yours differs.
export const getMyWallet = async (
  backendUrl: string,
  token: string
): Promise<{ tokens: number }> => {
  const url = new URL('/api/me', backendUrl).toString();
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return { tokens: (res.data?.tokens ?? 0) as number };
};
