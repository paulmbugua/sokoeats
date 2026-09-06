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

export async function createPaystackSubaccount({ businessName, bankCode, accountNumber, commissionRateBps = 1000 }) {
  if (!bankCode) throw Object.assign(new Error('A Paystack settlement bank code is required for a bank subaccount'), { status: 422 });
  const data = await paystack('/subaccount', {
    method: 'POST',
    body: {
      business_name: businessName,
      settlement_bank: bankCode,
      account_number: digits(accountNumber),
      percentage_charge: Number((Number(commissionRateBps) / 100).toFixed(2)),
      description: 'SokoEats verified store partner',
      primary_contact_name: businessName,
    },
  });
  if (!data.subaccount_code) throw Object.assign(new Error('Paystack did not return a subaccount code'), { status: 502 });
  return data;
}

export function estimatePaystackTransferFee(amount, method) {
  const value = Number(amount);
  if (method === 'mpesa_wallet') return value <= 1500 ? 20 : value <= 20000 ? 40 : 60;
  if (method === 'mpesa_till' || method === 'mpesa_paybill') {
    if (value <= 1500) return 40;
    if (value <= 10000) return 80;
    if (value <= 40000) return 140;
    if (value <= 999999) return 180;
    return 350;
  }
  if (value <= 10000) return 80;
  if (value <= 50000) return 120;
  if (value <= 999999) return 140;
  return 350;
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

export function verifyPaystackWebhook(rawBody, signature) {
  if (!signature || !process.env.PAYSTACK_SECRET_KEY) return false;
  const expected = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const left = Buffer.from(String(signature));
  const right = Buffer.from(expected);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
