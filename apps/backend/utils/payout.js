// apps/backend/utils/payout.js

export const ALLOWED_CURRENCIES = ['KES', 'USD'];
export const ALLOWED_METHODS = ['mpesa', 'wise'];

// Accept 07XXXXXXXX / 01XXXXXXXX / 2547XXXXXXXX / +2547XXXXXXXX / 2541XXXXXXXX / +2541XXXXXXXX
const MPESA_REGEX = /^(?:07|01|2547|\+2547|2541|\+2541)\d{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeMsisdnKE(input) {
  if (!input) return null;
  let s = String(input).trim();

  // keep + for a moment then strip all non-digits
  s = s.replace(/\s+/g, '');
  s = s.replace(/^\+/, '');
  s = s.replace(/\D+/g, ''); // digits only

  // Normalize to 2547/2541 format
  if (s.startsWith('0')) s = '254' + s.slice(1); // 07.. or 01..
  if (s.startsWith('7')) s = '254' + s; // 7XXXXXXXXX
  if (s.startsWith('1')) s = '254' + s; // 1XXXXXXXXX

  // Final validation: 2547XXXXXXXX or 2541XXXXXXXX
  if (!/^254(7|1)\d{8}$/.test(s)) return null;
  return s;
}

function normalizeEmail(input) {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  return s;
}

/**
 * Normalize payout fields from any body shape; return {error} on invalid.
 *
 * ✅ Supports both:
 * - payoutCurrency + payoutMethod + wiseEmail/mpesaPhoneNumber
 * - payout_currency + payout_method + wise_email/mpesa_phone_number
 *
 * ✅ Enforces current business rules:
 * - KES => mpesa required
 * - USD => wise required
 */
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
  const rawCurrency = String(body.payoutCurrency ?? body.payout_currency ?? 'USD')
    .toUpperCase()
    .trim();

  // Default method: USD→wise, KES→mpesa
  const fallbackMethod = rawCurrency === 'KES' ? 'mpesa' : 'wise';

  const rawMethodIn = String(body.payoutMethod ?? body.payout_method ?? fallbackMethod)
    .toLowerCase()
    .trim();

  const payout_currency = ALLOWED_CURRENCIES.includes(rawCurrency) ? rawCurrency : 'USD';
  let payout_method = ALLOWED_METHODS.includes(rawMethodIn) ? rawMethodIn : fallbackMethod;

  // Extract inputs (accept multiple key names)
  const wise_email_in = normalizeEmail(body.wiseEmail ?? body.wise_email ?? body.wiseEmailAddress);
  const mpesa_in_raw = String(
    body.mpesaPhoneNumber ??
      body.mpesa_phone_number ??
      body.mpesaPhone ??
      body.mpesa_phone ??
      '',
  ).trim();

  const mpesa_phone_number = mpesa_in_raw ? normalizeMsisdnKE(mpesa_in_raw) : null;
  const wise_email = wise_email_in || null;

  // Cross-field constraints (Wise + M-Pesa only)
  if (payout_currency === 'KES') {
    // Force M-Pesa for KES
    payout_method = 'mpesa';

    if (!mpesa_in_raw) {
      return { error: 'M-Pesa phone number is required for KES payouts.' };
    }

    // validate raw shape OR normalized; allow both user-entered and normalized forms
    const rawOk = MPESA_REGEX.test(mpesa_in_raw);
    const normOk = mpesa_phone_number ? /^254(7|1)\d{8}$/.test(mpesa_phone_number) : false;

    if (!rawOk && !normOk) {
      return { error: 'Invalid M-Pesa phone number format for KES payouts.' };
    }

    if (!mpesa_phone_number) {
      return { error: 'Invalid M-Pesa phone number format for KES payouts.' };
    }

    // For KES, Wise email is irrelevant → null it (prevents stale values)
    return {
      payout_currency: 'KES',
      payout_method: 'mpesa',
      stripe_connect_id: null,
      paypal_email: null,
      mpesa_phone_number,
      wise_email: null,
    };
  }

  // USD
  if (payout_currency === 'USD') {
    // Force Wise for USD (we only support Wise for USD right now)
    payout_method = 'wise';

    if (!wise_email || !EMAIL_REGEX.test(wise_email)) {
      return { error: 'A valid Wise email is required for USD payouts via Wise.' };
    }

    // For USD, mpesa is irrelevant → null it (prevents stale values)
    return {
      payout_currency: 'USD',
      payout_method: 'wise',
      stripe_connect_id: null,
      paypal_email: null,
      mpesa_phone_number: null,
      wise_email,
    };
  }

  // Should never happen because payout_currency is constrained above, but keep a safe fallback
  return {
    payout_currency: 'USD',
    payout_method: 'wise',
    stripe_connect_id: null,
    paypal_email: null,
    mpesa_phone_number: null,
    wise_email,
  };
}
