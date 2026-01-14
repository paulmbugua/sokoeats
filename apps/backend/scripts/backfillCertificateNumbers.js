/* eslint-disable no-console */
import pool from '../config/db.js';
import { generateCertificateNumber } from '../services/certificateService.js';

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE || 200);
const MAX_TOTAL = Number(process.env.BACKFILL_MAX_TOTAL || 0); // 0 = unlimited
const DRY_RUN =
  String(process.env.BACKFILL_DRY_RUN || '').toLowerCase() === '1' ||
  String(process.env.BACKFILL_DRY_RUN || '').toLowerCase() === 'true';

const DEFAULT_BRAND = process.env.CERT_BRAND_NAME?.trim() || 'DayBreak Academy';

async function columnExists(tableName, colName) {
  const q = await pool.query(
    `
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND column_name=$2
     LIMIT 1
    `,
    [tableName, colName],
  );
  return q.rowCount > 0;
}

async function main() {
  console.log('[backfill] start', {
    BATCH_SIZE,
    MAX_TOTAL,
    DRY_RUN,
    DEFAULT_BRAND,
  });

  // Ensure column exists
  const hasCol = await columnExists('certificates', 'certificate_number');
  if (!hasCol) {
    console.error(
      "[backfill] certificates.certificate_number column does not exist. Run the ALTER TABLE first.",
    );
    process.exit(1);
  }

  let totalUpdated = 0;

  // ✅ avoid `while(true)` to satisfy eslint no-constant-condition
  let keepGoing = true;
  while (keepGoing) {
    if (MAX_TOTAL > 0 && totalUpdated >= MAX_TOTAL) break;

    const limit =
      MAX_TOTAL > 0 ? Math.min(BATCH_SIZE, MAX_TOTAL - totalUpdated) : BATCH_SIZE;

    // Pull next batch needing backfill.
    // Brand resolution: latest org pass for that user+course, else DEFAULT_BRAND.
    const q = await pool.query(
      `
      SELECT
        c.id,
        c.student_id,
        c.course_id,
        c.issued_at,
        u.name  AS student_name,
        crs.title AS course_title,
        COALESCE(org.name, $1) AS brand_name
      FROM certificates c
      JOIN users u      ON u.id = c.student_id
      JOIN courses crs  ON crs.id = c.course_id
      LEFT JOIN LATERAL (
        SELECT o.name
          FROM org_quiz_attempts qa
          JOIN org_course_assignments a ON a.id = qa.assignment_id
          JOIN organizations o          ON o.id = COALESCE(a.org_id, qa.org_id)
         WHERE qa.user_id = c.student_id
           AND a.course_id = c.course_id
           AND qa.submitted_at IS NOT NULL
           AND qa.passed = TRUE
         ORDER BY qa.submitted_at DESC
         LIMIT 1
      ) org ON TRUE
      WHERE c.certificate_number IS NULL OR c.certificate_number = ''
      ORDER BY c.issued_at ASC NULLS LAST, c.id ASC
      LIMIT $2
      `,
      [DEFAULT_BRAND, limit],
    );

    if (!q.rowCount) {
      keepGoing = false; // ✅ explicit termination
      break;
    }

    console.log(`[backfill] fetched ${q.rowCount} rows`);

    for (const row of q.rows) {
      const issuedAt = row.issued_at ? new Date(row.issued_at) : new Date();
      const studentName = String(row.student_name || '').trim();
      const courseTitle = String(row.course_title || '').trim();
      const brandName =
        String(row.brand_name || DEFAULT_BRAND).trim() || DEFAULT_BRAND;

      if (!studentName || !courseTitle) {
        console.warn('[backfill] skip missing fields', {
          id: row.id,
          studentName,
          courseTitle,
        });
        continue;
      }

      const certNumber = generateCertificateNumber({
        brandName,
        studentName,
        courseTitle,
        issuedAt,
      });

      if (DRY_RUN) {
        console.log('[dry-run] would update', { id: row.id, certNumber });
        continue;
      }

      await pool.query(
        `
        UPDATE certificates
           SET certificate_number = $1
         WHERE id = $2
           AND (certificate_number IS NULL OR certificate_number = '')
        `,
        [certNumber, row.id],
      );

      totalUpdated += 1;

      if (totalUpdated % 50 === 0) {
        console.log('[backfill] progress', { totalUpdated });
      }

      if (MAX_TOTAL > 0 && totalUpdated >= MAX_TOTAL) break;
    }
  }

  console.log('[backfill] done', { totalUpdated });
  await pool.end();
}

main().catch(async (e) => {
  console.error('[backfill] failed', e);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
