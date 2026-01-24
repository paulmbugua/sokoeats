// apps/backend/controllers/pushController.js
import pool from '../config/db.js';

/** Strict UUID v4-ish validator (good enough for guarding DB uuid casts). */
function isValidUUID(v) {
  return (
    typeof v === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v.trim(),
    )
  );
}

/**
 * Resolve the caller's profile id from the authenticated user uuid.
 * Prevents Postgres error: invalid input syntax for type uuid: "37"
 */
async function resolveProfileId(req) {
  const userIdRaw = req.user?.id ?? req.user?.userId ?? null;
  const userId = typeof userIdRaw === 'string' ? userIdRaw.trim() : null;

  // If auth middleware gave us a non-uuid (e.g. "37"), fail gracefully.
  if (!userId || !isValidUUID(userId)) return null;

  const prof = await pool.query('select id from profiles where user_id = $1', [userId]);
  const profileId = prof.rows[0]?.id ?? null;

  // profileId should be an integer in your schema; ensure it’s a finite number.
  if (typeof profileId !== 'number' || !Number.isFinite(profileId)) return null;

  return profileId;
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

    if (!profileId) return res.status(401).json({ error: 'Unauthorized' });

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
