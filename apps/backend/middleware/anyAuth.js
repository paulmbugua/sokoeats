// apps/backend/middleware/anyAuth.js
import pool from '../config/db.js';

import authUser from './authUser.js';
import requireAuth from './auth.js';

const dbg = process.env.DBG_AUTH === '1';
const log = (...a) => dbg && console.log('[anyAuth]', ...a);

/** Run an Express middleware "silently" (without writing to the real res) */
function runSilently(mw, req) {
  return new Promise((resolve) => {
    let nextCalled = false;
    let errored = false;
    let wrote = false;

    const mockRes = {
      statusCode: 200,
      headers: {},
      locals: {},

      status(code) {
        this.statusCode = code;
        return this;
      },
      set(field, value) {
        this.headers[field] = value;
        return this;
      },
      json(_body) {
        wrote = true;
        return this;
      },
      send(_body) {
        wrote = true;
        return this;
      },
      end(_body) {
        wrote = true;
        return this;
      },
    };

    const next = (err) => {
      if (err) errored = true;
      nextCalled = !err;
      resolve(nextCalled && !errored && !wrote);
    };

    try {
      mw(req, mockRes, next);
    } catch (_e) {
      resolve(false);
    }
  });
}

// helper to normalise query token
function normalizeQueryToken(qVal) {
  if (!qVal) return null;
  if (Array.isArray(qVal)) return String(qVal[0]);
  return String(qVal);
}

function coerceInt(val) {
  if (val == null) return null;
  if (typeof val === 'number' && Number.isFinite(val)) return Math.trunc(val);
  const s = String(val).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function fetchUserByUsersId(usersId) {
  const q = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.name,
      u.tokens,
      u.auth_uuid,
      p.profile_id
    FROM users u
    LEFT JOIN LATERAL (
      SELECT p.id AS profile_id
      FROM profiles p
      WHERE p.user_id = u.id
      ORDER BY p.id ASC
      LIMIT 1
    ) p ON true
    WHERE u.id = $1
    LIMIT 1
    `,
    [usersId],
  );
  return q.rows?.[0] || null;
}

async function fetchUserByEmail(email) {
  const q = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.name,
      u.tokens,
      u.auth_uuid,
      p.profile_id
    FROM users u
    LEFT JOIN LATERAL (
      SELECT p.id AS profile_id
      FROM profiles p
      WHERE p.user_id = u.id
      ORDER BY p.id ASC
      LIMIT 1
    ) p ON true
    WHERE LOWER(u.email) = LOWER($1)
    LIMIT 1
    `,
    [String(email || '').trim()],
  );
  return q.rows?.[0] || null;
}

async function fetchUserByAuthUuid(authUuid) {
  const q = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.name,
      u.tokens,
      u.auth_uuid,
      p.profile_id
    FROM users u
    LEFT JOIN LATERAL (
      SELECT p.id AS profile_id
      FROM profiles p
      WHERE p.user_id = u.id
      ORDER BY p.id ASC
      LIMIT 1
    ) p ON true
    WHERE u.auth_uuid = $1
    LIMIT 1
    `,
    [authUuid],
  );
  return q.rows?.[0] || null;
}

async function fetchUserByProfileId(profileId) {
  const q = await pool.query(
    `
    SELECT
      u.id,
      u.email,
      u.name,
      u.tokens,
      u.auth_uuid,
      p.id AS profile_id
    FROM profiles p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = $1
    LIMIT 1
    `,
    [profileId],
  );
  return q.rows?.[0] || null;
}

/**
 * After authUser succeeds, normalize req.user so:
 * - req.user.id stays the "legacy" value (whatever authUser used before)
 * - req.user.users_id is always users.id (integer)
 * - req.user.auth_uuid is always users.auth_uuid (uuid) for ai_course_entitlements
 * - req.user.profile_id is populated when possible
 */
async function hydrateReqUser(req) {
  const raw = req.user || {};
  const legacyId = raw?.id;

  let u = null;

  const usersId = coerceInt(raw?.users_id);
  if (usersId) u = await fetchUserByUsersId(usersId);

  if (!u && raw?.auth_uuid) u = await fetchUserByAuthUuid(raw.auth_uuid);

  if (!u && raw?.email) u = await fetchUserByEmail(raw.email);

  if (!u) {
    const legacyInt = coerceInt(legacyId);
    if (legacyInt) {
      u = await fetchUserByUsersId(legacyInt);
      if (!u) u = await fetchUserByProfileId(legacyInt);
    }
  }

  if (!u) {
    log('hydrate: no matching users row', {
      path: req.path,
      legacyId,
      email: raw?.email,
      users_id: raw?.users_id,
      auth_uuid: raw?.auth_uuid,
    });
    return;
  }

  req.user = {
    ...raw,
    id: legacyId ?? raw?.id,
    users_id: u.id,
    auth_uuid: u.auth_uuid,
    profile_id: raw?.profile_id ?? u.profile_id ?? null,
    email: u.email,
    name: u.name,
    tokens: u.tokens,
  };

  log('hydrate: ok', {
    path: req.path,
    legacyId,
    users_id: req.user.users_id,
    profile_id: req.user.profile_id,
    auth_uuid: req.user.auth_uuid,
  });
}

async function anyAuth(req, res, next) {
  // If there is no Authorization header, allow ?token=<jwt> to stand in
  if (!req.headers.authorization && !req.headers.Authorization) {
    const tokenFromQuery = normalizeQueryToken(req.query?.token);
    if (tokenFromQuery) {
      req.headers.authorization = `Bearer ${tokenFromQuery}`;
    }
  }

  // Try regular user auth first
  if (await runSilently(authUser, req)) {
    try {
      await hydrateReqUser(req);
    } catch (e) {
      console.error('[anyAuth] hydrate error', e?.message || e);
    }
    return next();
  }

  // Then try org auth
  if (await runSilently(requireAuth, req)) return next();

  // Neither accepted → deny
  return res.status(401).json({ message: 'Unauthorized' });
}

export default anyAuth;
export { anyAuth };
