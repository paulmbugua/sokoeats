import crypto from 'crypto';
const production = process.env.NODE_ENV === 'production';
const simulate = process.env.SOKOEATS_ALLOW_PAYMENT_SIMULATION === 'true' || !production;
const mpesaReady = (callbackUrl) => process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY && (callbackUrl || process.env.MPESA_CALLBACK_URL);
const paystackReady = () => process.env.PAYSTACK_SECRET_KEY;
const mpesaBase = () => process.env.MPESA_ENV === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
const MPESA_PAYBILL = 'CustomerPayBillOnline';
const MPESA_BUY_GOODS = 'CustomerBuyGoodsOnline';

export function paymentReference(method) {
  return `SKO-${method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function normalizeKenyanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits === '254712345678' || digits === '0712345678' || digits === '712345678') throw Object.assign(new Error('Replace the sample M-Pesa number with the customer\'s real Safaricom number'), { status: 422 });
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  throw Object.assign(new Error('A valid Kenyan mobile number is required for payment and order updates'), { status: 422 });
}

async function mpesaToken() {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(`${mpesaBase()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) throw Object.assign(new Error('M-Pesa authorization failed'), { status: 502 });
  return (await res.json()).access_token;
}


function mpesaTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return String(d.getFullYear()) + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function mpesaPassword(shortcode, timestamp) {
  return Buffer.from(String(shortcode) + process.env.MPESA_PASSKEY + timestamp).toString('base64');
}

function mpesaTransactionType(shortcode) {
  const explicit = process.env.MPESA_TRANSACTION_TYPE;
  if ([MPESA_PAYBILL, MPESA_BUY_GOODS].includes(explicit)) return explicit;
  const shortcodeType = String(process.env.MPESA_SHORTCODE_TYPE || '').toLowerCase();
  if (['till', 'buygoods', 'buy_goods', 'buy-goods'].includes(shortcodeType)) return MPESA_BUY_GOODS;
  if (['paybill', 'pay_bill', 'pay-bill'].includes(shortcodeType)) return MPESA_PAYBILL;
  return String(shortcode).length >= 7 ? MPESA_BUY_GOODS : MPESA_PAYBILL;
}

function mpesaAccountReference(reference) {
  const configured = process.env.MPESA_ACCOUNT_REFERENCE || 'SOKOEATS';
  return String(configured || reference).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'SOKOEATS';
}

function mpesaTransactionDesc() {
  return String(process.env.MPESA_TRANSACTION_DESC || 'SokoEats').slice(0, 13);
}

function maskMpesaPhone(value) {
  return String(value).replace(/(254\d{3})\d+(\d{2})/, '$1*****$2');
}

function safeMpesaRequest(body) {
  const { Password: _password, ...safe } = body;
  return { ...safe, PartyA: maskMpesaPhone(body.PartyA), PhoneNumber: maskMpesaPhone(body.PhoneNumber) };
}
async function promptMpesa({ amount, phone, reference, callbackUrl }) {
  const mpesaCallbackUrl = callbackUrl || process.env.MPESA_CALLBACK_URL;
  if (!mpesaReady(mpesaCallbackUrl)) {
    if (!simulate) throw Object.assign(new Error('M-Pesa credentials are not configured'), { status: 503 });
    return { provider: 'mpesa', status: 'requires_action', providerReference: `SIM-${reference}`, promptMessage: `SokoEats payment prompt sent to ${phone}. Complete the simulated M-Pesa approval before placing the order.`, payload: { simulation: true } };
  }
  const timestamp = mpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const body = {
    BusinessShortCode: shortcode,
    Password: mpesaPassword(shortcode, timestamp),
    Timestamp: timestamp,
    TransactionType: mpesaTransactionType(shortcode),
    Amount: Math.round(Number(amount)),
    PartyA: phone.replace('+', ''),
    PartyB: process.env.MPESA_PARTY_B || shortcode,
    PhoneNumber: phone.replace('+', ''),
    CallBackURL: mpesaCallbackUrl,
    AccountReference: mpesaAccountReference(reference),
    TransactionDesc: mpesaTransactionDesc(),
  };
  const res = await fetch(`${mpesaBase()}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { Authorization: `Bearer ${await mpesaToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  const payload = { ...data, stkRequest: safeMpesaRequest(body) };
  if (!res.ok || data.ResponseCode !== '0') throw Object.assign(new Error(data.errorMessage || data.ResponseDescription || data.CustomerMessage || 'M-Pesa prompt failed'), { status: 502, payload });
  return { provider: 'mpesa', status: 'requires_action', providerReference: data.CheckoutRequestID, promptMessage: data.CustomerMessage || `SokoEats M-Pesa STK push sent to ${phone}. Enter your PIN to authorize KES ${Math.round(Number(amount)).toLocaleString('en-KE')}.`, payload };
}

async function queryMpesa(checkoutRequestId) {
  if (!mpesaReady(process.env.MPESA_CALLBACK_URL)) throw Object.assign(new Error('M-Pesa credentials are not configured'), { status: 503 });
  const timestamp = mpesaTimestamp();
  const shortcode = process.env.MPESA_SHORTCODE;
  const body = {
    BusinessShortCode: shortcode,
    Password: mpesaPassword(shortcode, timestamp),
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };
  const res = await fetch(`${mpesaBase()}/mpesa/stkpushquery/v1/query`, { method: 'POST', headers: { Authorization: `Bearer ${await mpesaToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.errorMessage || data.ResponseDescription || 'M-Pesa status query failed'), { status: 502, payload: data });
  return data;
}
async function promptPaystack({ amount, currency, email, reference, callbackUrl }) {
  if (!paystackReady()) {
    if (!simulate) throw Object.assign(new Error('Paystack secret key is not configured'), { status: 503 });
    return { provider: 'paystack', status: 'requires_action', providerReference: `SIM-${reference}`, actionUrl: `https://paystack.com/pay/sokoeats-demo?reference=${encodeURIComponent(reference)}`, promptMessage: 'SokoEats card checkout opened. Complete the simulated Paystack authorization before placing the order.', payload: { simulation: true } };
  }
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email || 'checkout@sokoeats.co.ke', amount: Math.round(Number(amount) * 100), currency, reference, callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL, channels: ['card'] }),
  });
  const data = await res.json();
  if (!res.ok || !data.status) throw Object.assign(new Error(data.message || 'Paystack checkout initialization failed'), { status: 502 });
  return { provider: 'paystack', status: 'requires_action', providerReference: data.data?.access_code, actionUrl: data.data?.authorization_url, promptMessage: 'SokoEats card checkout is ready. Complete Paystack authorization before placing the order.', payload: data.data || data };
}

export async function createPaymentPrompt(details) {
  return details.method === 'mpesa' ? promptMpesa(details) : promptPaystack(details);
}

export async function confirmGatewayPayment(intent) {
  if (intent.provider_payload?.simulation) return { status: 'paid', providerReference: intent.provider_reference, payload: { simulationConfirmedAt: new Date().toISOString() } };
  if (intent.method === 'card') {
    if (!paystackReady()) throw Object.assign(new Error('Paystack verification is not configured'), { status: 503 });
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(intent.reference)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } });
    const data = await res.json();
    if (!res.ok || !data.status) throw Object.assign(new Error(data.message || 'Paystack verification failed'), { status: 502 });
    return { status: data.data?.status === 'success' ? 'paid' : 'requires_action', providerReference: data.data?.reference, payload: data.data || data };
  }
  if (!intent.provider_reference) return { status: 'requires_action', providerReference: intent.provider_reference, payload: { verification: 'missing_mpesa_checkout_request_id' } };
  const data = await queryMpesa(intent.provider_reference);
  const resultCode = data.ResultCode == null ? null : Number(data.ResultCode);
  const status = resultCode === 0 ? 'paid' : resultCode == null || Number.isNaN(resultCode) ? 'requires_action' : 'failed';
  return { status, providerReference: intent.provider_reference, payload: { mpesaQuery: data } };
}
