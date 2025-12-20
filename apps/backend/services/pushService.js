// services/pushService.js
import pool from '../config/db.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (t) =>
  typeof t === 'string' &&
  (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function sendExpoPush(messages) {
  const batches = chunk(messages, 90);

  for (const batch of batches) {
    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });

    const json = await resp.json().catch(() => null);
    if (!resp.ok) {
      console.error('[push] expo send failed', resp.status, json);
    }
  }
}

export async function notifyNewMessage({
  recipientProfileId,
  title,
  body,
  data,
}) {
  // pull recipient tokens
  const { rows } = await pool.query(
    `select expo_push_token from push_tokens where profile_id = $1`,
    [recipientProfileId],
  );

  const tokens = rows.map((r) => r.expo_push_token).filter(isExpoToken);
  if (!tokens.length) return;

  const messages = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound: 'default',
    priority: 'high',
  }));

  await sendExpoPush(messages);
}
