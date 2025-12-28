import pool from '../config/db.js';
import { upsertAiCertificateEntitlement, getCertificateEntitlement } from './_aiCourseEntitlements.js';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const COST_TOKENS = 20;
const MAX_LESSONS = 60;

export async function purchaseAiCourseAccess(req, res) {
  const userId = req.user?.id;
  const courseId = String(req.params?.courseId || '').trim();

  if (!userId) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (!UUID_RE.test(courseId)) return res.status(400).json({ error: 'INVALID_COURSE_ID' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If already purchased, return quickly (idempotent)
    const existing = await getCertificateEntitlement(userId, courseId);
    if (existing) {
      // TODO: also return current token balance if you want
      await client.query('COMMIT');
      return res.json({ ok: true, alreadyOwned: true, entitlement: existing });
    }

    // ✅ Debit tokens (YOU MUST ADAPT THIS PART to your actual schema)
    // Option A (common): profiles has tokens column keyed by profile uuid
    // Option B: separate wallet table

    // Example pattern (replace with your real table/column):
    // const debit = await client.query(
    //   `UPDATE profiles
    //       SET tokens = tokens - $2
    //     WHERE id = (SELECT id FROM profiles WHERE user_id = $1 LIMIT 1)
    //       AND tokens >= $2
    //     RETURNING tokens;`,
    //   [userId, COST_TOKENS]
    // );
    // if (!debit.rowCount) {
    //   await client.query('ROLLBACK');
    //   return res.status(402).json({ error: 'INSUFFICIENT_TOKENS', cost: COST_TOKENS });
    // }
    // const tokensLeft = debit.rows[0].tokens;

    // ✅ Upsert entitlement (mark purchased)
    // NOTE: your helper currently uses pool internally; for strict atomicity,
    // tweak it to accept `db` (client) — see section below.
    const entitlement = await upsertAiCertificateEntitlement({
      userId,
      courseId,
      maxLessons: MAX_LESSONS,
      courseSource: 'catalog',
      // db: client,  <-- after you add support
    });

    await client.query('COMMIT');

    return res.json({
      ok: true,
      cost_tokens: COST_TOKENS,
      entitlement,
      // tokens: tokensLeft,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('[purchaseAiCourseAccess] failed', e);
    return res.status(500).json({ error: 'PURCHASE_FAILED' });
  } finally {
    client.release();
  }
}
