import fetch from 'node-fetch';

const ENV = (process.env.MPESA_ENV || process.env.DARAJA_ENV || 'sandbox').toLowerCase();
const BASE_URL =
  ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`[mpesa] Missing ${name}`);
  return value;
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function accessToken() {
  const key = required('MPESA_CONSUMER_KEY');
  const secret = required('MPESA_CONSUMER_SECRET');
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const response = await fetch(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.access_token) {
    throw new Error(`[mpesa] OAuth failed: ${json?.errorMessage || response.status}`);
  }
  return json.access_token;
}

export async function stkPushC2B({ phone, amount, callbackUrl }) {
  const shortcode = required('MPESA_SHORTCODE');
  const passkey = required('MPESA_PASSKEY');
  const token = await accessToken();
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  const url = callbackUrl || required('MPESA_CALLBACK_URL');

  const response = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
      Amount: Math.max(1, Math.round(Number(amount))),
      PartyA: String(phone),
      PartyB: shortcode,
      PhoneNumber: String(phone),
      CallBackURL: url,
      AccountReference: process.env.MPESA_ACCOUNT_REFERENCE || 'Ekazi',
      TransactionDesc: process.env.MPESA_TRANSACTION_DESC || 'Ekazi payment',
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.errorMessage || json?.ResponseDescription || 'M-Pesa STK push failed');
  }
  return json;
}
