import fetch from 'node-fetch';

function normalizePhoneForSms(phone) {
  const value = String(phone || '').trim();
  return value.startsWith('+') ? value : `+${value.replace(/^\+/, '')}`;
}

function maskPhone(phone) {
  const p = String(phone || '');
  return p.length <= 7 ? p : `${p.slice(0, 5)}***${p.slice(-3)}`;
}

export function hasSmsConfig() {
  return Boolean(String(process.env.AT_USERNAME || '').trim() && String(process.env.AT_API_KEY || '').trim());
}

export async function sendSms({ to, message }) {
  const username = String(process.env.AT_USERNAME || '').trim();
  const apiKey = String(process.env.AT_API_KEY || '').trim();
  const senderId = String(process.env.AT_SENDER_ID || process.env.AFRICASTALKING_SENDER_ID || '').trim() || undefined;
  const phone = normalizePhoneForSms(to);

  if (!username || !apiKey) {
    console.warn('[sms][africastalking] missing_config', { to: maskPhone(phone), hasUsername: Boolean(username), hasApiKey: Boolean(apiKey) });
    return { sent: false, skipped: true, reason: 'missing_config' };
  }

  const body = new URLSearchParams({ username, to: phone, message: String(message || '') });
  if (senderId) body.set('from', senderId);

  console.log('[sms][africastalking] send:start', { to: maskPhone(phone), username, senderId: senderId || null });
  const response = await fetch('https://api.africastalking.com/version1/messaging', {
    method: 'POST',
    headers: {
      apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok) {
    console.error('[sms][africastalking] send:error', { status: response.status, to: maskPhone(phone), data });
    const isAuthError = response.status === 401 || String(data?.raw || '').toLowerCase().includes('authentication');
    const error = new Error(isAuthError ? 'Africa\'s Talking authentication failed. Check AT_USERNAME and AT_API_KEY.' : 'SMS provider rejected the message');
    error.status = response.status;
    error.code = isAuthError ? 'SMS_AUTH_INVALID' : 'SMS_PROVIDER_REJECTED';
    error.data = data;
    throw error;
  }

  const recipients = data?.SMSMessageData?.Recipients || [];
  console.log('[sms][africastalking] send:ok', { to: maskPhone(phone), status: response.status, data });
  console.log('[sms][africastalking] recipients', JSON.stringify(recipients, null, 2));
  const accepted = recipients.some((recipient) => {
    const status = String(recipient?.status || '').toLowerCase();
    const statusCode = Number(recipient?.statusCode || 0);
    return status === 'success' || statusCode === 101;
  });
  if (!accepted) {
    const first = recipients[0] || {};
    console.warn('[sms][africastalking] recipient:not_delivered', {
      to: maskPhone(phone),
      status: first.status || null,
      statusCode: first.statusCode || null,
      messageId: first.messageId || null,
    });
    return {
      sent: false,
      data,
      provider: 'africastalking',
      reason: String(first.status || 'recipient_not_delivered'),
      statusCode: first.statusCode || null,
    };
  }
  return { sent: true, data };
}

export async function sendOtpSms(phone, otp, purpose = 'verification') {
  const label = purpose === 'password_reset' ? 'reset your Ekazi password' : 'verify your Ekazi phone number';
  return sendSms({
    to: phone,
    message: `Your Ekazi code is ${otp}. Use it to ${label}. It expires in 10 minutes. Do not share this code.`,
  });
}
