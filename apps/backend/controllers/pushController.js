// apps/backend/controllers/pushController.js
import pool from '../config/db.js';

async function resolveProfileId(req) {
  const userId = req.user?.id; // user_id from JWT
  if (!userId) return null;

  const prof = await pool.query('SELECT id FROM profiles WHERE user_id = $1', [userId]);
  return prof.rows[0]?.id ?? null;
}

export async function registerPushToken(req, res) {
  const profileId = await resolveProfileId(req);

  const { expoPushToken, platform = 'unknown', deviceId = null } = req.body ?? {};
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!expoPushToken || typeof expoPushToken !== 'string') {
    return res.status(400).json({ error: 'expoPushToken is required' });
  }

  await pool.query(
    `
    insert into push_tokens (profile_id, expo_push_token, platform, device_id)
    values ($1, $2, $3, $4)
    on conflict (profile_id, expo_push_token)
    do update set platform = excluded.platform, device_id = excluded.device_id
    `,
    [profileId, expoPushToken, platform, deviceId],
  );

  return res.json({ ok: true });
}

export async function unregisterPushToken(req, res) {
  const profileId = await resolveProfileId(req);

  const { expoPushToken } = req.body ?? {};
  if (!profileId) return res.status(401).json({ error: 'Unauthorized' });
  if (!expoPushToken || typeof expoPushToken !== 'string') {
    return res.status(400).json({ error: 'expoPushToken is required' });
  }

  await pool.query(
    `delete from push_tokens where profile_id = $1 and expo_push_token = $2`,
    [profileId, expoPushToken],
  );

  return res.json({ ok: true });
}
