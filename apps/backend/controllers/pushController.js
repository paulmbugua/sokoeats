// apps/backend/controllers/pushController.js
import pool from '../config/db.js';

/**
 * Resolve the caller's profile id from the authenticated users.id.
 */
async function resolveProfileId(req) {
  const userId = Number(req.user?.id ?? req.user?.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  const prof = await pool.query('select id from profiles where user_id = $1', [userId]);
  const profileId = Number(prof.rows[0]?.id);
  return Number.isSafeInteger(profileId) && profileId > 0 ? profileId : null;
}

/**
 * POST /api/push/register
 * body: { expoPushToken: string, platform?: string, deviceId?: string|null }
 */
export async function registerPushToken(req, res) {
  try {
    const profileId = await resolveProfileId(req);

    const {
      expoPushToken,
      platform = 'unknown',
      deviceId = null,
    } = req.body ?? {};

    if (!profileId) {
      return res.status(202).json({ ok: false, pendingProfile: true });
    }

    if (!expoPushToken || typeof expoPushToken !== 'string') {
      return res.status(400).json({ error: 'expoPushToken is required' });
    }

    const token = expoPushToken.trim();
    if (!token) return res.status(400).json({ error: 'expoPushToken is required' });

    // Normalize platform just a bit (optional)
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

    return res.json({ ok: true });
  } catch (err) {
    // Avoid unhandled rejection + return a clean error
    console.error('registerPushToken error:', err);
    return res.status(500).json({ error: 'Failed to register push token' });
  }
}

/**
 * POST /api/push/unregister
 * body: { expoPushToken: string }
 */
export async function unregisterPushToken(req, res) {
  try {
    const profileId = await resolveProfileId(req);
    const { expoPushToken } = req.body ?? {};

    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

    if (!expoPushToken || typeof expoPushToken !== 'string') {
      return res.status(400).json({ error: 'expoPushToken is required' });
    }

    const token = expoPushToken.trim();
    if (!token) return res.status(400).json({ error: 'expoPushToken is required' });

    await pool.query(
      `delete from push_tokens where expo_push_token = $1 and profile_id = $2`,
      [token, profileId],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('unregisterPushToken error:', err);
    return res.status(500).json({ error: 'Failed to unregister push token' });
  }
}
