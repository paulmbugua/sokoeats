// services/pushService.js
import pool from '../config/db.js';
import { isAppRecentlyActive, isChatActive } from './socketService.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 90;

let pushTokenSchemaReady;
export async function ensurePushTokenSchema() {
  if (pushTokenSchemaReady) return pushTokenSchemaReady;
  pushTokenSchemaReady = (async () => {
    await pool.query(`
      create table if not exists push_tokens (
        id bigserial primary key,
        profile_id text not null,
        expo_push_token text not null unique,
        platform text,
        device_id text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      )
    `);

    const { rows } = await pool.query(
      `select data_type
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'push_tokens'
          and column_name = 'profile_id'
        limit 1`,
    );
    const type = rows[0]?.data_type;
    if (type && type !== 'text' && type !== 'character varying') {
      await pool.query('alter table push_tokens alter column profile_id type text using profile_id::text');
    }

    await pool.query('alter table push_tokens add column if not exists platform text');
    await pool.query('alter table push_tokens add column if not exists device_id text');
    await pool.query('alter table push_tokens add column if not exists created_at timestamptz not null default now()');
    await pool.query('alter table push_tokens add column if not exists updated_at timestamptz not null default now()');
    await pool.query('alter table push_tokens add column if not exists last_seen_at timestamptz not null default now()');
    await pool.query('create unique index if not exists push_tokens_expo_push_token_uidx on push_tokens (expo_push_token)');
  })().catch((error) => {
    pushTokenSchemaReady = undefined;
    throw error;
  });
  return pushTokenSchemaReady;
}

// AUDIT: Expo push tokens are registered from apps/mobile/src/index.tsx using
// registerForPushToken() in apps/mobile/utils/notifications.ts and POSTed to
// /api/push/register. The backend stores tokens in push_tokens via
// apps/backend/controllers/pushController.js, and this service already sends
// Expo pushes for chat (notifyNewMessage). We reuse that same table + Expo API.

const isExpoToken = (t) =>
  typeof t === 'string' &&
  (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

let rateLimitReady;
async function ensureRateLimitTable() {
  if (rateLimitReady) return rateLimitReady;
  rateLimitReady = pool.query(
    `create table if not exists notification_rate_limits (
      key text primary key,
      last_sent_at timestamptz not null default now(),
      count int not null default 0
    )`,
  );
  return rateLimitReady;
}

async function sendExpoPush(messages) {
  const batches = chunk(messages, EXPO_BATCH_SIZE);

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

async function fetchTokensForProfiles(profileIds) {
  if (!profileIds.length) return [];
  await ensurePushTokenSchema();
  const unique = Array.from(new Set(profileIds.map((id) => String(id))));
  const { rows } = await pool.query(
    `select expo_push_token
       from push_tokens
      where profile_id::text = any($1::text[])`,
    [unique],
  );
  return rows.map((r) => r.expo_push_token).filter(isExpoToken);
}

export async function registerPushToken({
  profileId,
  expoPushToken,
  platform = 'unknown',
  deviceId = null,
}) {
  if (!profileId || !expoPushToken) return;
  await ensurePushTokenSchema();
  const token = String(expoPushToken).trim();
  if (!token) return;
  const platformNorm =
    typeof platform === 'string' && platform.trim() ? platform.trim().toLowerCase() : 'unknown';
  const deviceIdNorm =
    typeof deviceId === 'string' && deviceId.trim() ? deviceId.trim() : null;

  await pool.query(
    `
    insert into push_tokens
      (profile_id, expo_push_token, platform, device_id, updated_at, last_seen_at)
    values
      ($1, $2, $3, $4, now(), now())
    on conflict (expo_push_token)
    do update set
      profile_id   = excluded.profile_id,
      platform     = excluded.platform,
      device_id    = excluded.device_id,
      updated_at   = now(),
      last_seen_at = now()
    `,
    [profileId, token, platformNorm, deviceIdNorm],
  );
}

export async function sendPushToProfiles(profileIds, payload) {
  const tokens = await fetchTokensForProfiles(profileIds);
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: 'default',
    priority: 'high',
    ...(payload.tag ? { tag: payload.tag } : {}),
    ...(payload.collapseKey ? { collapseKey: payload.collapseKey } : {}),
  }));
  await sendExpoPush(messages);
}

export async function sendPushToUser(userId, payload) {
  if (!userId) return;
  const { rows } = await pool.query(
    `select id
       from profiles
      where user_id::text = $1
      limit 1`,
    [String(userId)],
  );
  const profileId = rows[0]?.id;
  if (!profileId) return;
  await sendPushToProfiles([profileId], payload);
}

export async function sendPushToMany(userIds, payload) {
  const ids = Array.from(new Set((userIds || []).map((id) => String(id)).filter(Boolean)));
  if (!ids.length) return;
  const { rows } = await pool.query(
    `select id
       from profiles
      where user_id::text = any($1::text[])`,
    [ids],
  );
  const profileIds = rows.map((row) => row.id);
  await sendPushToProfiles(profileIds, payload);
}

export async function rateLimitPush(key, windowSeconds) {
  if (!key) return { shouldSend: true, pendingCount: 0 };
  await ensureRateLimitTable();
  const { rows } = await pool.query(
    `select last_sent_at, count
       from notification_rate_limits
      where key = $1`,
    [key],
  );
  const row = rows[0];
  const now = new Date();

  if (!row) {
    await pool.query(
      `insert into notification_rate_limits (key, last_sent_at, count)
       values ($1, $2, 0)`,
      [key, now],
    );
    return { shouldSend: true, pendingCount: 0 };
  }

  const lastSentAt = new Date(row.last_sent_at);
  const deltaSec = (now.getTime() - lastSentAt.getTime()) / 1000;

  if (deltaSec <= windowSeconds) {
    const nextCount = Number(row.count || 0) + 1;
    await pool.query(
      `update notification_rate_limits
          set count = $2
        where key = $1`,
      [key, nextCount],
    );
    return { shouldSend: false, pendingCount: nextCount };
  }

  const pendingCount = Number(row.count || 0) + 1;
  await pool.query(
    `update notification_rate_limits
        set last_sent_at = $2,
            count = 0
      where key = $1`,
    [key, now],
  );
  return { shouldSend: true, pendingCount };
}

export const shouldSuppressChatPush = (
  recipientProfileId,
  conversationId,
  options = {},
) => {
  const chatWindowMs = options.chatWindowMs ?? 30000;
  const appWindowMs = options.appWindowMs ?? 30000;
  return (
    isChatActive(recipientProfileId, conversationId, chatWindowMs) ||
    isAppRecentlyActive(recipientProfileId, appWindowMs)
  );
};

export async function notifyNewMessage({ recipientProfileId, title, body, data }) {
  await sendPushToProfiles([String(recipientProfileId)], { title, body, data });
}
