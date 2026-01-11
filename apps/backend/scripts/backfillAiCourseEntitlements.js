// apps/backend/scripts/backfillAiCourseEntitlements.js
import pool from '../config/db.js';
import { upsertAiCertificateEntitlement } from '../controllers/_aiCourseEntitlements.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function main() {
  const { rows } = await pool.query(
    `
    SELECT DISTINCT user_id, course_id
      FROM ai_certificate_issuances
     WHERE user_id IS NOT NULL
       AND course_id IS NOT NULL
    `,
  );

  let upserted = 0;
  for (const row of rows) {
    const courseId = String(row.course_id || '').trim();
    const userId = row.user_id;
    if (!courseId || !userId) continue;

    const entitlement = await upsertAiCertificateEntitlement({
      userId,
      courseId,
      courseSource: UUID_RE.test(courseId) ? 'catalog' : 'typed',
      maxLessons: 60,
    });

    if (entitlement) upserted += 1;
  }

  // eslint-disable-next-line no-console
  console.log('[backfillAiCourseEntitlements] scanned', rows.length, 'upserted', upserted);
}

main()
  .catch((err) => {
    console.error('[backfillAiCourseEntitlements] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
