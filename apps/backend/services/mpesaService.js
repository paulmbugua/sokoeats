import fetch from 'node-fetch';

const ENV = String(process.env.MPESA_ENV || process.env.DARAJA_ENV || 'sandbox').trim().toLowerCase();
const IS_PRODUCTION = ['production', 'prod', 'live'].includes(ENV);
const BASE_URL =
  String(process.env.MPESA_BASE_URL || '').trim() ||
  (IS_PRODUCTION
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke');

function clean(value) {
  return String(value || '').trim();
}

function mask(value, visible = 4) {
  const text = clean(value);
  if (!text) return null;
  if (text.length <= visible) return '*'.repeat(text.length);
  return '*'.repeat(Math.max(0, text.length - visible)) + text.slice(-visible);
}

function required(name) {
  const value = clean(process.env[name]);
  if (!value) throw new Error(`[mpesa] Missing ${name}`);
  return value;
}

async function readDarajaJson(response) {
  const text = await response.text().catch(() => '');
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 1000) };
  }
}

function darajaMessage(json, fallback) {
  return (
    json?.errorMessage ||
    json?.error_description ||
    json?.ResponseDescription ||
    json?.responseDescription ||
    json?.fault?.faultstring ||
    json?.raw ||
    fallback
  );
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
  const url = `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
  console.log('[mpesa][oauth] start', {
    env: ENV,
    baseUrl: BASE_URL,
    consumerKey: mask(key),
  });
  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  const json = await readDarajaJson(response);
  if (!response.ok || !json?.access_token) {
    console.error('[mpesa][oauth] failed', {
      env: ENV,
      baseUrl: BASE_URL,
      status: response.status,
      body: json,
    });
    throw new Error(`[mpesa] OAuth failed: ${darajaMessage(json, response.status)}`);
  }
  const token = clean(json.access_token);
  console.log('[mpesa][oauth] ok', {
    env: ENV,
    baseUrl: BASE_URL,
    status: response.status,
    tokenLength: token.length,
    tokenSuffix: mask(token, 6),
    expiresIn: json.expires_in || null,
  });
  return token;
}

async function postStkPush(payload) {
  const token = await accessToken();
  const response = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return { response, json: await readDarajaJson(response) };
}

export async function stkPushC2B({ phone, amount, callbackUrl }) {
  const shortcode = required('MPESA_SHORTCODE');
  const passkey = required('MPESA_PASSKEY');
  const ts = timestamp();
  const password = Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
  const url = clean(callbackUrl) || required('MPESA_CALLBACK_URL');
  const safeAmount = Math.max(1, Math.round(Number(amount)));
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: ts,
    TransactionType: clean(process.env.MPESA_TRANSACTION_TYPE) || 'CustomerPayBillOnline',
    Amount: safeAmount,
    PartyA: String(phone),
    PartyB: shortcode,
    PhoneNumber: String(phone),
    CallBackURL: url,
    AccountReference: clean(process.env.MPESA_ACCOUNT_REFERENCE) || 'Ekazi',
    TransactionDesc: clean(process.env.MPESA_TRANSACTION_DESC) || 'Ekazi payment',
  };

  console.log('[mpesa][stk] start', {
    env: ENV,
    baseUrl: BASE_URL,
    shortcode: mask(shortcode),
    phone: mask(phone),
    amount: safeAmount,
    callbackHost: (() => {
      try {
        return new URL(url).host;
      } catch {
        return 'invalid-url';
      }
    })(),
  });

  let { response, json } = await postStkPush(payload);
  const message = String(darajaMessage(json, '') || '');
  if (!response.ok && /invalid access token/i.test(message)) {
    console.warn('[mpesa][stk] invalid_token_retry', {
      env: ENV,
      baseUrl: BASE_URL,
      status: response.status,
      body: json,
    });
    ({ response, json } = await postStkPush(payload));
  }

  if (!response.ok) {
    console.error('[mpesa][stk] failed', {
      env: ENV,
      baseUrl: BASE_URL,
      status: response.status,
      body: json,
    });
    throw new Error(`[mpesa] STK push failed: ${darajaMessage(json, response.status)}`);
  }
  console.log('[mpesa][stk] ok', {
    env: ENV,
    status: response.status,
    checkoutRequestId: json?.CheckoutRequestID || null,
    merchantRequestId: json?.MerchantRequestID || null,
    responseCode: json?.ResponseCode || null,
  });
  return json;
}

export async function initiateB2CPayment({ phone, amount, remarks = 'Ekazi provider payout', occasion = 'Ekazi Payout' }) {
  const shortcode = clean(process.env.MPESA_B2C_SHORTCODE) || required('MPESA_SHORTCODE');
  const initiator = required('MPESA_B2C_INITIATOR_NAME');
  const securityCredential = required('MPESA_B2C_SECURITY_CREDENTIAL');
  const resultUrl = required('MPESA_B2C_RESULT_URL');
  const timeoutUrl = required('MPESA_B2C_TIMEOUT_URL');
  const token = await accessToken();
  const response = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      InitiatorName: initiator,
      SecurityCredential: securityCredential,
      CommandID: clean(process.env.MPESA_B2C_COMMAND_ID) || 'BusinessPayment',
      Amount: Math.max(1, Math.round(Number(amount))),
      PartyA: String(shortcode),
      PartyB: String(phone),
      Remarks: String(remarks).slice(0, 100),
      QueueTimeOutURL: timeoutUrl,
      ResultURL: resultUrl,
      Occasion: String(occasion).slice(0, 100),
    }),
  });
  const json = await readDarajaJson(response);
  if (!response.ok || json?.ResponseCode !== '0') {
    console.error('[mpesa][b2c] failed', {
      env: ENV,
      baseUrl: BASE_URL,
      status: response.status,
      body: json,
    });
    throw new Error(`[mpesa] B2C payment failed: ${darajaMessage(json, response.status)}`);
  }
  return json;
}
