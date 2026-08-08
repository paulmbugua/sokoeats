import crypto from 'crypto';
const production = process.env.NODE_ENV === 'production';
const simulate = process.env.SOKOEATS_ALLOW_PAYMENT_SIMULATION === 'true' || !production;
const mpesaReady = () => process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET && process.env.MPESA_SHORTCODE && process.env.MPESA_PASSKEY && process.env.MPESA_CALLBACK_URL;
const paystackReady = () => process.env.PAYSTACK_SECRET_KEY;
const mpesaBase = () => process.env.MPESA_ENV === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

export function paymentReference(method) {
  return `SKO-${method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function normalizeKenyanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
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

async function promptMpesa({ amount, phone, reference }) {
  if (!mpesaReady()) {
    if (!simulate) throw Object.assign(new Error('M-Pesa credentials are not configured'), { status: 503 });
    return { provider: 'mpesa', status: 'requires_action', providerReference: `SIM-${reference}`, promptMessage: `SokoEats payment prompt sent to ${phone}. Complete the simulated M-Pesa approval before placing the order.`, payload: { simulation: true } };
  }
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const shortcode = process.env.MPESA_SHORTCODE;
  const body = {
    BusinessShortCode: shortcode,
    Password: Buffer.from(`${shortcode}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64'),
    Timestamp: timestamp,
    TransactionType: process.env.MPESA_TRANSACTION_TYPE || 'CustomerPayBillOnline',
    Amount: Math.round(Number(amount)),
    PartyA: phone.replace('+', ''),
    PartyB: process.env.MPESA_PARTY_B || shortcode,
    PhoneNumber: phone.replace('+', ''),
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: reference,
    TransactionDesc: 'SokoEats order payment',
  };
  const res = await fetch(`${mpesaBase()}/mpesa/stkpush/v1/processrequest`, { method: 'POST', headers: { Authorization: `Bearer ${await mpesaToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok || data.ResponseCode !== '0') throw Object.assign(new Error(data.errorMessage || data.ResponseDescription || 'M-Pesa prompt failed'), { status: 502 });
  return { provider: 'mpesa', status: 'requires_action', providerReference: data.CheckoutRequestID, promptMessage: `SokoEats M-Pesa STK push sent to ${phone}. Enter your PIN to authorize KES ${Math.round(Number(amount)).toLocaleString('en-KE')}.`, payload: data };
}

async function promptPaystack({ amount, currency, email, reference, callbackUrl }) {
  if (!paystackReady()) {
    if (!simulate) throw Object.assign(new Error('Paystack secret key is not configured'), { status: 503 });
    return { provider: 'paystack', status: 'requires_action', providerReference: `SIM-${reference}`, actionUrl: `https://paystack.com/pay/sokoeats-demo?reference=${encodeURIComponent(reference)}`, promptMessage: 'SokoEats card checkout opened. Complete the simulated Paystack authorization before placing the order.', payload: { simulation: true } };
  }
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email || 'guest@sokoeats.local', amount: Math.round(Number(amount) * 100), currency, reference, callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL }),
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
  return { status: 'requires_action', providerReference: intent.provider_reference, payload: { verification: 'awaiting_mpesa_callback_or_manual_requery' } };
}
