const smsSenderId = () => process.env.SMS_SENDER_ID || 'Ekazi';
const smsProviderUrl = () => process.env.SMS_PROVIDER_URL || process.env.SMS_API_URL || '';

export function orderUpdateMessage(orderCode, status, extra = '') {
  const statusCopy = status === 'placed' ? 'paid and placed' : status.replace(/_/g, ' ');
  return `SokoEats: Order ${orderCode} is ${statusCopy}. ${extra}`.trim();
}

async function dispatchSms({ phone, message }) {
  const url = smsProviderUrl();
  if (!url || !process.env.SMS_API_KEY) return { status: 'queued', providerResponse: { configured: false } };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SMS_API_KEY}` },
    body: JSON.stringify({ to: phone, message, senderId: smsSenderId(), from: smsSenderId(), brand: 'SokoEats' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { status: 'failed', providerResponse: data };
  return { status: 'sent', providerResponse: data };
}

export async function sendOrderUpdateSms(client, { orderId, orderCode, phone, status, extra }) {
  if (!phone) return null;
  const message = orderUpdateMessage(orderCode, status, extra);
  const delivery = await dispatchSms({ phone, message });
  const { rows } = await client.query(
    `INSERT INTO sokoeats_sms_notifications (order_id, phone, sender_id, brand_name, message, event, delivery_status, provider_response)
     VALUES ($1,$2,$3,'SokoEats',$4,$5,$6,$7)
     RETURNING *`,
    [orderId, phone, smsSenderId(), message, status, delivery.status, delivery.providerResponse],
  );
  return rows[0];
}
