import pool from '../config/db.js';
import { upsertAiCertificateEntitlement, getCertificateEntitlement } from './_aiCourseEntitlements.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COST_TOKENS = 20;
const MAX_LESSONS = 60;

export async function purchaseAiCourseAccess(req, res) {
  const userId = req.user?.users_id ?? req.user?.id;
  const courseId = String(req.params?.courseId || '').trim();

  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (!UUID_RE.test(courseId)) return res.status(400).json({ error: 'INVALID_COURSE_ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // IMPORTANT: use client here so it’s consistent with the transaction
    const existing = await getCertificateEntitlement(userId, courseId, client);
    if (existing) {
      // Optional but good: ensure enrollment exists even for already-owned
      await client.query(
  `
  INSERT INTO enrollments (student_id, course_id, status, started_at, updated_at)
  VALUES ($1, $2, $3, NOW(), NOW())
  ON CONFLICT (student_id, course_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    started_at = COALESCE(enrollments.started_at, EXCLUDED.started_at),
    updated_at = NOW()
  `,
  [userId, courseId, 'active']
);


      await client.query('COMMIT');
      return res.json({ ok: true, alreadyOwned: true, entitlement: existing });
    }

    // 1) debit tokens here (FOR UPDATE / tokens >= cost)

    // 2) create entitlement
    const entitlement = await upsertAiCertificateEntitlement({
      userId,
      courseId,
      maxLessons: MAX_LESSONS,
      courseSource: 'catalog',
      db: client,
    });

    // 3) ✅ upsert enrollment HERE
    await client.query(
  `
  INSERT INTO enrollments (student_id, course_id, status, started_at, updated_at)
  VALUES ($1, $2, $3, NOW(), NOW())
  ON CONFLICT (student_id, course_id)
  DO UPDATE SET
    status = EXCLUDED.status,
    started_at = COALESCE(enrollments.started_at, EXCLUDED.started_at),
    updated_at = NOW()
  `,
  [userId, courseId, 'active']
);


    await client.query('COMMIT');
    return res.json({ ok: true, cost_tokens: COST_TOKENS, entitlement });
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'PURCHASE_FAILED' });
  } finally {
    client.release();
  }
}
