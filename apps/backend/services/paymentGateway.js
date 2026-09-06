import crypto from 'crypto';

const simulate = process.env.SOKOEATS_ALLOW_PAYMENT_SIMULATION === 'true';

function paystackKey() {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    if (simulate) return null;
    throw Object.assign(new Error('PAYSTACK_SECRET_KEY is required for SokoEats payments'), { status: 503 });
  }
  return process.env.PAYSTACK_SECRET_KEY;
}

async function paystack(path, { method = 'GET', body } = {}) {
  const key = paystackKey();
  if (!key) return null;
  const response = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.status === false) {
    throw Object.assign(new Error(payload.message || `Paystack ${path} failed`), {
      status: 502,
      providerPayload: payload,
    });
  }
  return payload.data || payload;
}

export function paymentReference(method) {
  return `SKO-${method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function normalizeKenyanPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits === '254712345678' || digits === '0712345678' || digits === '712345678') {
    throw Object.assign(new Error('Replace the sample number with the customer\'s real mobile number'), { status: 422 });
  }
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.length === 9) return `+254${digits}`;
  throw Object.assign(new Error('A valid Kenyan mobile number is required for payment and order updates'), { status: 422 });
}

function simulatedPrompt(details) {
  return {
    provider: 'paystack',
    status: 'requires_action',
    providerReference: details.method === 'paystack' ? `SIM-${details.reference}` : `SIM-${details.reference}`,
    actionUrl: ['card', 'paystack'].includes(details.method) ? `https://paystack.com/pay/sokoeats-demo?reference=${encodeURIComponent(details.reference)}` : null,
    promptMessage: details.method === 'mpesa'
      ? `Test payment authorization created for ${details.phone}.`
      : details.method === 'paystack'
        ? 'Test Paystack checkout created for M-Pesa or card.'
        : 'Test card checkout created.',
    payload: { simulation: true, channel: details.method === 'mpesa' ? 'mobile_money' : details.method === 'paystack' ? 'paystack_checkout' : 'card' },
  };
}

async function promptPaystackMpesa({ amount, currency, email, phone, reference }) {
  const data = await paystack('/charge', {
    method: 'POST',
    body: {
      email: email || 'checkout@sokoeats.co.ke',
      amount: Math.round(Number(amount) * 100),
      currency,
      reference,
      mobile_money: { phone, provider: 'mpesa' },
      metadata: { platform: 'sokoeats', payment_method: 'mpesa' },
    },
  });
  if (!data) return simulatedPrompt({ amount, currency, email, phone, reference, method: 'mpesa' });
  if (!['pay_offline', 'pending', 'success'].includes(String(data.status))) {
    throw Object.assign(new Error(data.display_text || data.message || 'Paystack M-PESA authorization could not be started'), { status: 502, providerPayload: data });
  }
  return {
    provider: 'paystack',
    status: data.status === 'success' ? 'paid' : 'requires_action',
    providerReference: data.reference || reference,
    promptMessage: data.display_text || 'Authorize the SokoEats payment from the M-PESA prompt on your phone.',
    payload: { ...data, channel: 'mobile_money', mobileMoneyProvider: 'mpesa' },
  };
}

async function promptPaystackCard({ amount, currency, email, reference, callbackUrl }) {
  const data = await paystack('/transaction/initialize', {
    method: 'POST',
    body: {
      email: email || 'checkout@sokoeats.co.ke',
      amount: Math.round(Number(amount) * 100),
      currency,
      reference,
      callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
      channels: ['card'],
      metadata: { platform: 'sokoeats', payment_method: 'card' },
    },
  });
  if (!data) return simulatedPrompt({ amount, currency, email, reference, method: 'card' });
  return {
    provider: 'paystack',
    status: 'requires_action',
    providerReference: data.access_code || reference,
    actionUrl: data.authorization_url,
    promptMessage: 'Complete the secure Paystack card checkout before placing the order.',
    payload: { ...data, channel: 'card' },
  };
}

async function promptPaystackCheckout({ amount, currency, email, reference, callbackUrl, customerName, phone }) {
  const metadata = {
    platform: 'sokoeats',
    payment_method: 'paystack',
    payment_options: ['mpesa', 'card'],
    customer_name: customerName || null,
    customer_phone: phone || null,
  };
  const body = {
    email: email || 'checkout@sokoeats.co.ke',
    amount: Math.round(Number(amount) * 100),
    currency,
    reference,
    callback_url: callbackUrl || process.env.PAYSTACK_CALLBACK_URL,
    channels: ['card', 'mobile_money'],
    metadata,
  };
  const data = await paystack('/transaction/initialize', { method: 'POST', body });
  if (!data) return simulatedPrompt({ amount, currency, email, phone, reference, method: 'paystack' });
  return {
    provider: 'paystack',
    status: 'requires_action',
    providerReference: data.access_code || reference,
    actionUrl: data.authorization_url,
    promptMessage: 'Choose M-Pesa or card on the secure Paystack checkout to complete this SokoEats order.',
    payload: { ...data, channel: 'paystack_checkout', channels: body.channels },
  };
}

export async function createPaymentPrompt(details) {
  if (details.method === 'mpesa') return promptPaystackMpesa(details);
  if (details.method === 'paystack') return promptPaystackCheckout(details);
  return promptPaystackCard(details);
}

export async function confirmGatewayPayment(intent) {
  if (intent.provider_payload?.simulation) {
    return { status: 'paid', providerReference: intent.provider_reference, payload: { simulationConfirmedAt: new Date().toISOString() } };
  }
  const data = await paystack(`/transaction/verify/${encodeURIComponent(intent.reference)}`);
  const paid = data?.status === 'success';
  if (paid && (Number(data.amount) !== Number(intent.amount) * 100 || data.currency !== intent.currency)) {
    throw Object.assign(new Error('Paystack verification amount or currency does not match this checkout'), { status: 409, providerPayload: data });
  }
  return {
    status: paid ? 'paid' : ['failed', 'abandoned', 'reversed'].includes(String(data?.status)) ? 'failed' : 'requires_action',
    providerReference: data?.reference || intent.provider_reference,
    payload: { paystackVerification: data },
  };
}
