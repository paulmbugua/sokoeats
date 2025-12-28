// apps/backend/controllers/_aiCourseEntitlements.js
import pool from '../config/db.js';

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

/** Cache which column on profiles holds the auth UUID */
let _profilesUuidShapeCache = null;

/**
 * Detect which UUID column exists on profiles that represents auth user UUID.
 * Supports schemas like:
 *  - profiles.user_id (uuid)
 *  - profiles.auth_user_id (uuid)
 *  - profiles.user_uuid (uuid)
 * Also detects if profiles.user_id is numeric (legacy).
 */
async function getProfilesUuidShape(db) {
  if (_profilesUuidShapeCache) return _profilesUuidShapeCache;

  const { rows } = await db.query(
    `
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name IN ('id','user_id','auth_user_id','user_uuid')
    `,
  );

  const byName = new Map(rows.map((r) => [r.column_name, r.data_type]));
  const userIdType = byName.get('user_id') || null;
  const userIdIsNumeric = userIdType === 'integer' || userIdType === 'bigint';

  // Prefer explicit UUID columns if present; fallback to user_id if it is UUID
  const uuidCandidates = ['auth_user_id', 'user_uuid', 'user_id'];
  const uuidCol = uuidCandidates.find((c) => byName.get(c) === 'uuid') || null;

  _profilesUuidShapeCache = { uuidCol, userIdIsNumeric, userIdType };
  return _profilesUuidShapeCache;
}

/**
 * Resolve auth UUID from a numeric identifier.
 *
 * Tries:
 *  1) profiles.id = $1  (common if numeric is profile id)
 *  2) profiles.user_id = $1  (ONLY if profiles.user_id is numeric legacy AND uuidCol != user_id)
 */
async function resolveUserUuidFromNumeric(db, userIdNum) {
  const n = Number(userIdNum);
  if (!Number.isFinite(n)) return null;

  const shape = await getProfilesUuidShape(db);
  if (!shape.uuidCol) return null;

  const uuidCol = shape.uuidCol;

  // 1) numeric as profiles.id
  {
    const { rows } = await db.query(
      `SELECT ${uuidCol} AS uid
         FROM profiles
        WHERE id = $1
        LIMIT 1`,
      [n],
    );
    const uid = rows?.[0]?.uid ? String(rows[0].uid) : null;
    if (uid && isUuid(uid)) return uid;
  }

  // 2) numeric as profiles.user_id (only if user_id is numeric and uuidCol is different)
  if (shape.userIdIsNumeric && uuidCol !== 'user_id') {
    const { rows } = await db.query(
      `SELECT ${uuidCol} AS uid
         FROM profiles
        WHERE user_id = $1
        LIMIT 1`,
      [n],
    );
    const uid = rows?.[0]?.uid ? String(rows[0].uid) : null;
    if (uid && isUuid(uid)) return uid;
  }

  return null;
}

/**
 * Normalize any incoming userId (uuid OR numeric) into a UUID string.
 * Returns null if it cannot be resolved.
 */
async function normalizeUserUuid(db, userId) {
  const raw = String(userId ?? '').trim();
  if (!raw) return null;
  if (isUuid(raw)) return raw;
  if (isNumeric(raw)) return resolveUserUuidFromNumeric(db, raw);
  return null;
}

/**
 * Upsert certificate entitlement.
 * NOTE: ai_course_entitlements.user_id is UUID, so we normalize userId.
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

  // org_id is uuid or null; if provided but not uuid, drop to null (safe)
  const orgUuid = orgId && isUuid(orgId) ? String(orgId) : null;

  const sql = `
    INSERT INTO ai_course_entitlements (user_id, org_id, course_id, course_source, purchase_type, max_lessons)
    VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
    ON CONFLICT (user_id, course_id, purchase_type)
    DO UPDATE SET
      org_id = COALESCE(EXCLUDED.org_id, ai_course_entitlements.org_id),
      course_source = EXCLUDED.course_source,
      max_lessons = GREATEST(ai_course_entitlements.max_lessons, EXCLUDED.max_lessons),
      updated_at = NOW()
    RETURNING *;
  `;

  const { rows } = await db.query(sql, [
    userUuid,
    orgUuid,
    courseId,
    courseSource,
    CERT_TYPE,
    maxLessons,
  ]);

  return rows[0] || null;
}

/**
 * Increment lesson usage for a certificate entitlement.
 * IMPORTANT: no casting unless userId is resolvable to UUID.
 */
export async function incrementLessonUsage({ userId, courseId, amount, db = pool }) {
  const userUuid = await normalizeUserUuid(db, userId);
  if (!userUuid || !courseId) return null;

  const inc = Math.max(1, Number(amount) || 1);

  const sql = `
    UPDATE ai_course_entitlements
       SET lessons_used = lessons_used + $3,
           updated_at = NOW()
     WHERE user_id = $1::uuid
       AND course_id = $2
       AND purchase_type = $4
       AND lessons_used + $3 <= max_lessons
     RETURNING max_lessons, lessons_used;
  `;

  const { rows } = await db.query(sql, [userUuid, courseId, inc, CERT_TYPE]);
  if (rows[0]) return { ...rows[0], reachedCap: false };

  // When cap is hit, surface current usage/cap instead of null
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

  if (fallback.rows?.[0]) {
    return { ...fallback.rows[0], reachedCap: true };
  }

  return null;
}

/**
 * Fetch a single certificate entitlement for a course.
 */
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

/**
 * List all entitlements for a user.
 * FIX: do not cast numeric "1631" to uuid.
 */
export async function getEntitlementsForUser(userId, db = pool) {
  const userUuid = await normalizeUserUuid(db, userId);

  // If caller passed numeric and we couldn't map it, don't 500 — just return empty.
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
