// apps/backend/services/resolveUserFromClaims.js
import pool from '../config/db.js';

function normEmail(email) {
  return (email || '').trim().toLowerCase();
}

/**
 * Only relink when the token explicitly says the email is verified/confirmed.
 * Supports common claim shapes (Firebase/Auth0/Supabase-style).
 */
function isEmailVerified(claims) {
  const v =
    claims?.email_verified ??
    claims?.emailVerified ??
    claims?.user_metadata?.email_verified ??
    claims?.user_metadata?.emailVerified ??
    claims?.email_confirmed_at ??
    claims?.emailConfirmedAt;

  if (v === true) return true;
  if (typeof v === 'string') {
    // "true" or a non-empty timestamp like "2026-01-10T..."
    return v.toLowerCase() === 'true' || v.trim().length > 0;
  }
  return false;
}

/**
 * Resolve a row from `users` for the authenticated caller.
 * - Primary: match by auth_uuid
 * - Fallback (Option A): if email is verified, match by email and relink auth_uuid
 *
 * Returns: { user, relinked } where user is a row from users.
 */
export async function resolveUserFromClaims(claims) {
  const authUuid = (claims?.sub || claims?.auth_uuid || claims?.uid || '').trim();
  const emailRaw = claims?.email;
  const email = normEmail(emailRaw);
  const verified = isEmailVerified(claims);

  if (!authUuid) {
    return { user: null, relinked: false, reason: 'missing_auth_uuid' };
  }

  // 1) Fast path: auth_uuid already mapped
  {
    const q = await pool.query(
      `SELECT id, name, email, tokens, auth_uuid
         FROM users
        WHERE auth_uuid = $1
        LIMIT 1`,
      [authUuid],
    );
    if (q.rows[0]) return { user: q.rows[0], relinked: false };
  }

  // 2) Option A: relink by verified email
  if (email && verified) {
    // Use a transaction to avoid races
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the email row if it exists
      const byEmail = await client.query(
        `SELECT id, name, email, tokens, auth_uuid
           FROM users
          WHERE lower(email) = $1
          LIMIT 1
          FOR UPDATE`,
        [email],
      );

      if (!byEmail.rows[0]) {
        await client.query('ROLLBACK');
        return { user: null, relinked: false, reason: 'no_user_for_verified_email' };
      }

      const u = byEmail.rows[0];

      // Ensure new authUuid not already used (should be empty because fast path failed,
      // but keep it for safety)
      const exists = await client.query(
        `SELECT id FROM users WHERE auth_uuid = $1 LIMIT 1`,
        [authUuid],
      );
      if (exists.rows[0]) {
        await client.query('ROLLBACK');
        return { user: null, relinked: false, reason: 'auth_uuid_already_in_use' };
      }

      // Relink
      await client.query(
        `UPDATE users
            SET auth_uuid = $1
          WHERE id = $2`,
        [authUuid, u.id],
      );

      const refreshed = await client.query(
        `SELECT id, name, email, tokens, auth_uuid
           FROM users
          WHERE id = $1`,
        [u.id],
      );

      await client.query('COMMIT');
      return { user: refreshed.rows[0], relinked: true };
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch {}
      throw e;
    } finally {
      client.release();
    }
  }

  // 3) If not verified email, do NOT relink (prevents account takeover)
  return { user: null, relinked: false, reason: verified ? 'no_email' : 'email_not_verified' };
}
