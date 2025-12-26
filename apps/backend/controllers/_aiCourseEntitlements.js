// apps/backend/controllers/_aiCourseEntitlements.js
import pool from '../config/db.js';

const CERT_TYPE = 'certificate';

export async function upsertAiCertificateEntitlement({
  userId,
  orgId = null,
  courseId,
  courseSource = 'catalog',
  maxLessons = 60,
}) {
  if (!userId || !courseId) return null;
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
  const { rows } = await pool.query(sql, [
    userId,
    orgId,
    courseId,
    courseSource,
    CERT_TYPE,
    maxLessons,
  ]);
  return rows[0] || null;
}

export async function incrementLessonUsage({ userId, courseId, amount }) {
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
  const { rows } = await pool.query(sql, [userId, courseId, inc, CERT_TYPE]);
  return rows[0] || null;
}

export async function getCertificateEntitlement(userId, courseId) {
  if (!userId || !courseId) return null;
  const { rows } = await pool.query(
    `
    SELECT *
      FROM ai_course_entitlements
     WHERE user_id = $1::uuid
       AND course_id = $2
       AND purchase_type = $3
     LIMIT 1
    `,
    [userId, courseId, CERT_TYPE],
  );
  return rows[0] || null;
}

export async function getEntitlementsForUser(userId) {
  const { rows } = await pool.query(
    `
    SELECT *
      FROM ai_course_entitlements
     WHERE user_id = $1::uuid
     ORDER BY created_at DESC
    `,
    [userId],
  );
  return rows;
}
