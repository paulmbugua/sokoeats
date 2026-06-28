import pool from '../config/db.js';

function missing(error) {
  return ['42P01', '42703'].includes(error?.code);
}

export async function getCertificateEntitlement(userId, courseId, db = pool) {
  if (!userId || !courseId) return null;
  try {
    const { rows } = await db.query(
      `SELECT *
         FROM ai_course_entitlements
        WHERE user_id = $1
          AND course_id::text = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, String(courseId)],
    );
    return rows[0] || null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

export async function upsertAiCertificateEntitlement({
  userId,
  orgId = null,
  courseId,
  courseSource = 'catalog',
  maxLessons = 60,
}) {
  if (!userId || !courseId) return null;
  try {
    const { rows } = await pool.query(
      `INSERT INTO ai_course_entitlements
        (user_id, org_id, course_id, course_source, max_lessons, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (user_id, course_id)
       DO UPDATE SET
         org_id = EXCLUDED.org_id,
         course_source = EXCLUDED.course_source,
         max_lessons = EXCLUDED.max_lessons,
         updated_at = NOW()
       RETURNING *`,
      [userId, orgId, String(courseId), courseSource, maxLessons],
    );
    return rows[0] || null;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}
