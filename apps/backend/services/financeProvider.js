import crypto from 'crypto';

function paystackKey() {
  if (!process.env.PAYSTACK_SECRET_KEY) throw Object.assign(new Error('PAYSTACK_SECRET_KEY is required for recipients, payouts, and Paystack refunds'), { status: 503 });
  return process.env.PAYSTACK_SECRET_KEY;
}

async function paystack(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${paystackKey()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) throw Object.assign(new Error(payload.message || `Paystack ${path} failed`), { status: 502, providerPayload: payload });
  return payload.data || payload;
}

function digits(value) { return String(value || '').replace(/\D/g, ''); }

export async function createPaystackRecipient({ name, method, accountNumber, bankCode }) {
  let type;
  let providerBankCode = bankCode;
  if (method === 'mpesa_wallet') { type = 'mobile_money'; providerBankCode = 'MPESA'; }
  else if (method === 'mpesa_till') { type = 'mobile_money_business'; providerBankCode = 'MPTILL'; }
  else if (method === 'mpesa_paybill') { type = 'mobile_money_business'; providerBankCode = 'MPPAYBILL'; }
  else if (method === 'bank') type = 'kepss';
  else throw Object.assign(new Error('Unsupported payout method'), { status: 422 });
  if (!providerBankCode) throw Object.assign(new Error('Settlement bank code is required'), { status: 422 });
  const data = await paystack('/transferrecipient', { method: 'POST', body: { type, name, account_number: digits(accountNumber), bank_code: providerBankCode, currency: 'KES' } });
  if (!data.recipient_code) throw Object.assign(new Error('Paystack did not return a transfer recipient code'), { status: 502 });
  return data;
}

export async function initiatePaystackTransfer({ reference, amount, recipientCode, reason }) {
  if (!recipientCode) throw Object.assign(new Error('Verified Paystack recipient code is required'), { status: 409 });
  return paystack('/transfer', { method: 'POST', body: { source: 'balance', amount: Math.round(Number(amount) * 100), recipient: recipientCode, reference, reason } });
}

export async function verifyPaystackTransfer(reference) {
  return paystack(`/transfer/verify/${encodeURIComponent(reference)}`);
}

export async function requestPaystackRefund({ transactionReference, amount }) {
  return paystack('/refund', { method: 'POST', body: { transaction: transactionReference, amount: Math.round(Number(amount) * 100), currency: 'KES' } });
}

function mpesaBase() { return process.env.MPESA_ENV === 'live' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke'; }
async function mpesaToken() {
  if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) throw Object.assign(new Error('M-Pesa API credentials are required for refunds'), { status: 503 });
  const authorization = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await fetch(`${mpesaBase()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${authorization}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) throw Object.assign(new Error('M-Pesa refund authorization failed'), { status: 502, providerPayload: payload });
  return payload.access_token;
}

export async function requestMpesaReversal({ transactionId, amount, reference }) {
  const required = ['MPESA_INITIATOR_NAME','MPESA_SECURITY_CREDENTIAL','MPESA_REVERSAL_RESULT_URL','MPESA_REVERSAL_TIMEOUT_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (!transactionId) throw Object.assign(new Error('The original M-Pesa receipt number is required for reversal'), { status: 409 });
  if (missing.length) throw Object.assign(new Error(`M-Pesa reversal configuration is incomplete: ${missing.join(', ')}`), { status: 503 });
  const body = {
    Initiator: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: 'TransactionReversal',
    TransactionID: transactionId,
    Amount: Math.round(Number(amount)),
    ReceiverParty: process.env.MPESA_BUSINESS_SHORTCODE || process.env.MPESA_SHORTCODE,
    RecieverIdentifierType: process.env.MPESA_REVERSAL_RECEIVER_TYPE || '11',
    ResultURL: process.env.MPESA_REVERSAL_RESULT_URL,
    QueueTimeOutURL: process.env.MPESA_REVERSAL_TIMEOUT_URL,
    Remarks: `SokoEats refund ${reference}`.slice(0, 100),
    Occasion: reference.slice(0, 100),
  };
  const response = await fetch(`${mpesaBase()}/mpesa/reversal/v1/request`, { method: 'POST', headers: { Authorization: `Bearer ${await mpesaToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ResponseCode !== '0') throw Object.assign(new Error(payload.errorMessage || payload.ResponseDescription || 'M-Pesa reversal failed'), { status: 502, providerPayload: payload });
  return payload;
}

export function verifyPaystackWebhook(rawBody, signature) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const left = Buffer.from(String(signature));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function mpesaReceiptFromIntent(intent) {
  const items = intent?.provider_payload?.mpesaCallback?.CallbackMetadata?.Item || [];
  return items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value || null;
}
