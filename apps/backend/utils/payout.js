// apps/backend/utils/payout.js

export const ALLOWED_CURRENCIES = ['KES', 'USD'];
export const ALLOWED_METHODS = ['mpesa', 'wise'];

// Accept 07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX / +2547XXXXXXXX / 2541XXXXXXXX / +2541XXXXXXXX
const MPESA_REGEX = /^(?:07|01|2547|\+2547|2541|\+2541)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeMsisdnKE(input) {
  if (!input) return null;
  let s = String(input).replace(/\D+/g, ''); // strip non-digits

  // Normalize to 2547/2541 format
  if (s.startsWith('0')) s = '254' + s.slice(1); // 07.. or 01..
  if (s.startsWith('7')) s = '254' + s; // 7XXXXXXXXX
  if (s.startsWith('1')) s = '254' + s; // 1XXXXXXXXX

  // Final validation: 2547XXXXXXXX or 2541XXXXXXXX
  if (!/^254(7|1)\d{8}$/.test(s)) return null;
  return s;
}

/** Normalize payout fields from any body shape; return {error} on invalid. */
export function normalizePayoutFromBody(body = {}, role) {
  // Only tutors configure payouts
  if (String(role || '').toLowerCase() !== 'tutor') {
    return {
      payout_currency: null,
      payout_method: null,
      stripe_connect_id: null,
      paypal_email: null,
      mpesa_phone_number: null,
      wise_email: null,
    };
  }

  // Coerce + trim raw inputs
  const rawCurrency = String(
    body.payoutCurrency ?? body.payout_currency ?? 'USD',
  )
    .toUpperCase()
    .trim();

  // Default method: USD→wise, KES→mpesa
  const fallbackMethod = rawCurrency === 'KES' ? 'mpesa' : 'wise';

  const rawMethodIn = String(
    body.payoutMethod ?? body.payout_method ?? fallbackMethod,
  )
    .toLowerCase()
    .trim();

  const payout_currency = ALLOWED_CURRENCIES.includes(rawCurrency)
    ? rawCurrency
    : 'USD';
  let payout_method = ALLOWED_METHODS.includes(rawMethodIn)
    ? rawMethodIn
    : fallbackMethod;

  // Extract inputs
  const wise_email_in = (body.wiseEmail ?? body.wise_email ?? '')
    .toString()
    .trim()
    .toLowerCase();
  const mpesa_in_raw = (body.mpesaPhoneNumber ?? body.mpesa_phone_number ?? '')
    .toString()
    .trim();

  // Normalize/validate
  const mpesa_phone_number = mpesa_in_raw
    ? normalizeMsisdnKE(mpesa_in_raw)
    : null;
  const wise_email = wise_email_in || null;

  // Cross-field constraints (Wise + M-Pesa only)
  if (payout_currency === 'KES') {
    // Force M-Pesa for KES
    payout_method = 'mpesa';
    if (!mpesa_phone_number) {
      return { error: 'M-Pesa phone number is required for KES payouts.' };
    }
    if (!MPESA_REGEX.test(mpesa_phone_number)) {
      return { error: 'Invalid M-Pesa phone number format for KES payouts.' };
    }
  } else if (payout_currency === 'USD') {
    // Force Wise for USD (we only support Wise for USD right now)
    payout_method = 'wise';
    if (!wise_email || !EMAIL_REGEX.test(wise_email)) {
      return {
        error: 'A valid Wise email is required for USD payouts via Wise.',
      };
    }
  }

  // Keep legacy keys as null so older code doesn’t explode
  return {
    payout_currency,
    payout_method,
    stripe_connect_id: null,
    paypal_email: null,
    mpesa_phone_number,
    wise_email,
  };
}
