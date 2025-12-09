// controllers/_entitlements.js

/** Strict UUID (v1–v5) check */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (v) => UUID_RE.test(String(v || '').trim());

/** Cache the detected shape of course_entitlements so we don’t re-query every time. */
let _entShapeCache = null;
/**
 * Detect table shape/constraints we care about:
 *  - whether user_id exists and is NOT NULL
 *  - whether student_id exists
 *  - whether purchased_at exists
 */
async function getEntShape(db) {
  if (_entShapeCache) return _entShapeCache;

  const { rows } = await db.query(
    `
    SELECT column_name, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'course_entitlements'
       AND column_name IN ('user_id','student_id','purchased_at')
    `
  );


  
  const hasUserId     = rows.some((r) => r.column_name === 'user_id');
  const userIdNotNull = rows.some((r) => r.column_name === 'user_id' && r.is_nullable === 'NO');
  const hasStudentId  = rows.some((r) => r.column_name === 'student_id');
  const hasPurchased  = rows.some((r) => r.column_name === 'purchased_at');

  _entShapeCache = { hasUserId, userIdNotNull, hasStudentId, hasPurchased };
  return _entShapeCache;
}

/**
 * Look up a user's entitlement row for a course.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {string|number} userId  UUID or numeric id depending on your auth
 * @param {string} courseId        UUID
 * @returns {Promise<{tier?: 'standard'|'extended', can_certificate?: boolean, can_transcript?: boolean} | null>}
 */
export async function getEntitlement(db, userId, courseId) {
  const uid = String(userId ?? '').trim();
  const cid = String(courseId ?? '').trim();
  if (!isUuid(cid)) return null;

  const shape = await getEntShape(db);

  // UUID caller + table has user_id: use that
  if (isUuid(uid) && shape.hasUserId) {
    const { rows } = await db.query(
      `
      SELECT tier, can_certificate, can_transcript
        FROM course_entitlements
       WHERE user_id = $1::uuid AND course_id = $2::uuid
       LIMIT 1
      `,
      [uid, cid]
    );
    return rows[0] || null;
  }

  // Numeric caller + table has student_id
  if (!isUuid(uid) && shape.hasStudentId) {
    try {
      const idNum = Number(uid);
      if (!Number.isFinite(idNum)) return null;
      const { rows } = await db.query(
        `
        SELECT tier, can_certificate, can_transcript
          FROM course_entitlements
         WHERE student_id = $1::bigint AND course_id = $2::uuid
         LIMIT 1
        `,
        [idNum, cid]
      );
      return rows[0] || null;
    } catch (e) {
      if (e && e.code === '42703') return null; // student_id not present yet
      throw e;
    }
  }

  // Shape doesn’t match caller — nothing to read.
  return null;
}

/**
 * Upsert an entitlement row after a successful claim/payment or org coverage.
 * Extended=true implies transcript access and tier 'extended'.
 *
 * Schema-aware Option B (UPDATE-then-INSERT via CTE) without ON CONFLICT.
 * We only INSERT when the target column set can be satisfied without violating NOT NULL.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {{ userId: string|number, courseId: string, extended?: boolean }} args
 */
export async function upsertEntitlement(db, { userId, courseId, extended = false }) {
  const uid = String(userId ?? '').trim();
  const cid = String(courseId ?? '').trim();
  if (!isUuid(cid)) throw new Error('upsertEntitlement: courseId must be a UUID');

  const desiredTier     = extended ? 'extended' : 'standard';
  const grantTranscript = !!extended;

  const shape = await getEntShape(db);

  // ---------- Modern / UUID callers ----------
  if (isUuid(uid)) {
    if (!shape.hasUserId) return; // table has no user_id column — nothing to do for this caller shape

    // Build purchased_at fragment only if the column exists
    const purchasedSet = shape.hasPurchased ? `, purchased_at = COALESCE(ce.purchased_at, NOW())` : ``;
    const purchasedCols = shape.hasPurchased ? `, purchased_at` : ``;
    const purchasedVals = shape.hasPurchased ? `, NOW()` : ``;

    const sql = `
      WITH updated AS (
        UPDATE course_entitlements ce
           SET can_certificate = TRUE,
               can_transcript  = ce.can_transcript OR $4
             ${purchasedSet}
             , tier = CASE
                        WHEN $4 THEN 'extended'
                        ELSE COALESCE(ce.tier, $3)
                      END
         WHERE ce.user_id  = $1::uuid
           AND ce.course_id = $2::uuid
         RETURNING ce.id
      )
      INSERT INTO course_entitlements
        (user_id, course_id, tier, can_certificate, can_transcript${purchasedCols})
      SELECT $1::uuid, $2::uuid, $3, TRUE, $4${purchasedVals}
      WHERE NOT EXISTS (SELECT 1 FROM updated);
    `;
    await db.query(sql, [uid, cid, desiredTier, grantTranscript]);
    return;
  }

  // ---------- Legacy / numeric callers ----------
  const idNum = Number(uid);
  if (!Number.isFinite(idNum)) return;

  // If the table doesn’t have student_id, we can’t write a legacy record.
  if (!shape.hasStudentId) return;

  // Build purchased_at fragments conditionally
  const purchasedSet = shape.hasPurchased ? `, purchased_at = COALESCE(ce.purchased_at, NOW())` : ``;
  const purchasedCols = shape.hasPurchased ? `, purchased_at` : ``;
  const purchasedVals = shape.hasPurchased ? `, NOW()` : ``;

  // 1) UPDATE existing legacy rows
  const updateSql = `
    WITH updated AS (
      UPDATE course_entitlements ce
         SET can_certificate = TRUE,
             can_transcript  = ce.can_transcript OR $4
           ${purchasedSet}
           , tier = CASE
                      WHEN $4 THEN 'extended'
                      ELSE COALESCE(ce.tier, $3)
                    END
       WHERE ce.student_id = $1::bigint
         AND ce.course_id  = $2::uuid
       RETURNING ce.id
    )
    SELECT COUNT(*)::int AS touched FROM updated;
  `;
  const upd = await db.query(updateSql, [idNum, cid, desiredTier, grantTranscript]);
  const touched = Number(upd?.rows?.[0]?.touched || 0);

  // 2) If nothing updated, consider INSERT.
  //    Only insert when:
  //      - student_id exists (true here), AND
  //      - (user_id does not exist) OR (user_id exists but is NULLABLE).
  //    If user_id exists AND is NOT NULL, inserting a student-only row would violate NOT NULL — so skip.
  if (touched === 0) {
    if (shape.hasUserId && shape.userIdNotNull) {
      // Best-effort: skip INSERT to avoid "null value in column user_id" errors.
      // (Your auto-heal remains no-op on mixed schemas until a migration provides a UUID.)
      return;
    }

    const insertSql = `
      INSERT INTO course_entitlements
        (student_id, course_id, tier, can_certificate, can_transcript${purchasedCols})
      VALUES ($1::bigint, $2::uuid, $3, TRUE, $4${purchasedVals});
    `;
    try {
      await db.query(insertSql, [idNum, cid, desiredTier, grantTranscript]);
    } catch (e) {
      // If legacy column disappears in a partial deploy, just ignore; this is a soft heal.
      if (e && e.code === '42703') return;
      throw e;
    }
  }
}
