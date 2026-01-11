// apps/backend/controllers/_aiCourseEntitlements.js
import pool from '../config/db.js';
import crypto from 'node:crypto';

const CERT_TYPE = 'certificate';

/** Strict UUID (v1–v5) check */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return UUID_RE.test(String(v || '').trim());
}
function isNumeric(v) {
  return /^\d+$/.test(String(v || '').trim());
}

/**
 * IMPORTANT: MUST MATCH narrationGate.js anonToUuid() EXACTLY
 * Deterministic UUID from string (numeric IDs -> uuid)
 */
function anonToUuid(s) {
  const hex = crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(
    17,
    20,
  )}-${hex.slice(20)}`;
}

/**
 * Normalize incoming userId into the UUID we store in ai_course_entitlements.user_id.
 *
 * Your schema has only integer IDs, so:
 * - numeric => anonToUuid(`user:${id}`)
 * - uuid    => keep as-is (future proof if you later add auth UUIDs)
 */
async function normalizeUserUuid(db, userId) {
  const raw = String(userId ?? '').trim();
  if (!raw) return null;

  if (isUuid(raw)) return raw;
  if (isNumeric(raw)) {
    const numericId = Number(raw);

    try {
      const byUserId = await db.query(
        `SELECT auth_uuid::text AS auth_uuid FROM users WHERE id = $1 LIMIT 1`,
        [numericId],
      );
      const authUuid = byUserId.rows?.[0]?.auth_uuid;
      if (isUuid(authUuid)) return authUuid;
    } catch {
      // fall through
    }

    try {
      const byProfileId = await db.query(
        `
        SELECT u.auth_uuid::text AS auth_uuid
          FROM profiles p
          JOIN users u ON u.id = p.user_id
         WHERE p.id = $1
         LIMIT 1
        `,
        [numericId],
      );
      const authUuid = byProfileId.rows?.[0]?.auth_uuid;
      if (isUuid(authUuid)) return authUuid;
    } catch {
      // fall through
    }

    return anonToUuid(`user:${raw}`);
  }

  return null;
}

/**
 * Upsert certificate entitlement.
 * ai_course_entitlements.user_id is UUID.
 */
export async function upsertAiCertificateEntitlement({
  userId,
  orgId = null,
  courseId,
  courseSource = 'catalog',
  maxLessons = 60,
  db = pool,
}) {
  if (!userId || !courseId) return null;

  const userUuid = await normalizeUserUuid(db, userId);
  if (!userUuid) return null;

  const orgUuid = orgId && isUuid(orgId) ? String(orgId) : null;

  const sql = `
    INSERT INTO ai_course_entitlements
      (user_id, org_id, course_id, course_source, purchase_type, max_lessons)
    VALUES
      ($1::uuid, $2::uuid, $3, $4, $5, $6)
    ON CONFLICT (user_id, course_id, purchase_type)
    DO UPDATE SET
      org_id        = COALESCE(EXCLUDED.org_id, ai_course_entitlements.org_id),
      course_source = EXCLUDED.course_source,
      max_lessons   = GREATEST(ai_course_entitlements.max_lessons, EXCLUDED.max_lessons),
      updated_at    = NOW()
    RETURNING *;
  `;

  const { rows } = await db.query(sql, [
    userUuid,
    orgUuid,
    courseId,
    courseSource,
    CERT_TYPE,
    Math.max(1, Number(maxLessons) || 60),
  ]);

  return rows[0] || null;
}

export async function incrementLessonUsage({ userId, courseId, amount, db = pool }) {
  const userUuid = await normalizeUserUuid(db, userId);
  if (!userUuid || !courseId) return null;

  const inc = Math.max(1, Number(amount) || 1);

  const sql = `
    UPDATE ai_course_entitlements
       SET lessons_used = lessons_used + $3,
           updated_at   = NOW()
     WHERE user_id = $1::uuid
       AND course_id = $2
       AND purchase_type = $4
       AND lessons_used + $3 <= max_lessons
     RETURNING max_lessons, lessons_used;
  `;

  const { rows } = await db.query(sql, [userUuid, courseId, inc, CERT_TYPE]);
  if (rows[0]) return { ...rows[0], reachedCap: false };

  const fallback = await db.query(
    `
    SELECT max_lessons, lessons_used
      FROM ai_course_entitlements
     WHERE user_id = $1::uuid
       AND course_id = $2
       AND purchase_type = $3
     LIMIT 1
    `,
    [userUuid, courseId, CERT_TYPE],
  );

  if (fallback.rows?.[0]) return { ...fallback.rows[0], reachedCap: true };
  return null;
}

export async function getCertificateEntitlement(userId, courseId, db = pool) {
  const userUuid = await normalizeUserUuid(db, userId);
  if (!userUuid || !courseId) return null;

  const { rows } = await db.query(
    `
    SELECT *
      FROM ai_course_entitlements
     WHERE user_id = $1::uuid
       AND course_id = $2
       AND purchase_type = $3
     LIMIT 1
    `,
    [userUuid, courseId, CERT_TYPE],
  );

  return rows[0] || null;
}

export async function getEntitlementsForUser(userId, db = pool) {
  const userUuid = await normalizeUserUuid(db, userId);
  if (!userUuid) return [];

  const { rows } = await db.query(
    `
    SELECT *
      FROM ai_course_entitlements
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
    `,
    [userUuid],
  );

  return rows || [];
}
