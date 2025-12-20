// apps/backend/middleware/requireProfile.js
import pool from '../config/db.js';

/**
 * Attach the user's profile to req without hard-failing when missing.
 * - For admin tokens (id like "admin:<email>"), sets req.profile = null.
 * - For numeric user ids, loads profile if present.
 * Sets:
 *   - req.profile        → { id, role, userId } | null
 *   - req.profileExists  → boolean
 *
 * Handlers can decide whether to enforce existence (e.g., return 404/400).
 */
export default async function requireProfile(req, res, next) {
  try {
    const rawId = req.user?.id;
    const userId = Number(rawId);

    // Non-numeric subject (e.g., admin token) => no profile lookup
    if (!Number.isInteger(userId)) {
      req.profile = null;
      req.profileExists = false;
      return next();
    }

    const { rows } = await pool.query(
      `SELECT id AS "profileId", role
         FROM profiles
        WHERE user_id = $1
        LIMIT 1`,
      [userId],
    );

    if (!rows.length) {
      req.profile = null;
      req.profileExists = false;
      return next();
    }

    req.profile = { id: rows[0].profileId, role: rows[0].role, userId };
    req.profileExists = true;
    return next();
  } catch (err) {
    console.error('requireProfile Error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}
