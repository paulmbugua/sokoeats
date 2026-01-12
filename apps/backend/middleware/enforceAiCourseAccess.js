// apps/backend/middleware/enforceAiCourseAccess.js
import pool from '../config/db.js';
import { getCertificateEntitlement } from '../controllers/_aiCourseEntitlements.js';

/**
 * Helpers to safely detect schema without crashing when columns/tables differ.
 */
async function tableExists(tableName) {
  const q = await pool.query(`SELECT to_regclass($1) AS reg`, [`public.${tableName}`]);
  return Boolean(q.rows?.[0]?.reg);
}

async function existingColumns(tableName, candidates) {
  const q = await pool.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND column_name = ANY($2::text[])
    `,
    [tableName, candidates],
  );
  return new Set(q.rows.map((r) => r.column_name));
}

function pickFirst(set, candidates) {
  for (const c of candidates) if (set.has(c)) return c;
  return null;
}

/**
 * Best-effort: classify course as "sandbox/private" vs "public".
 * We ONLY reference columns that actually exist.
 *
 * Adjust candidates if your schema uses different naming.
 */
async function getCourseAccessMeta(courseId) {
  const candidatesTables = ['courses', 'ai_courses'];

  for (const table of candidatesTables) {
    if (!(await tableExists(table))) continue;

    const cols = await existingColumns(table, [
      // sandbox markers
      'is_ai_sandbox',
      'ai_sandbox',
      'is_sandbox',
      'sandbox',
      'source_kind',
      'kind',

      // ownership markers
      'created_by_user_id',
      'owner_user_id',
      'user_id',
      'created_by',

      // public markers
      'is_public',
      'public',
      'visibility',
      'access',
    ]);

    const ownerCol = pickFirst(cols, [
      'created_by_user_id',
      'owner_user_id',
      'user_id',
      'created_by',
    ]);

    // sandbox expression (safe)
    let sandboxExpr = 'false';
    if (cols.has('is_ai_sandbox')) sandboxExpr = 'COALESCE(is_ai_sandbox,false)';
    else if (cols.has('ai_sandbox')) sandboxExpr = 'COALESCE(ai_sandbox,false)';
    else if (cols.has('is_sandbox')) sandboxExpr = 'COALESCE(is_sandbox,false)';
    else if (cols.has('sandbox')) sandboxExpr = 'COALESCE(sandbox,false)';
    else if (cols.has('source_kind')) sandboxExpr = `(source_kind = 'ai_sandbox')`;
    else if (cols.has('kind')) sandboxExpr = `(kind = 'ai_sandbox')`;
    else if (ownerCol) sandboxExpr = `(${ownerCol} IS NOT NULL)`;

    // public expression (safe; default true)
    let publicExpr = 'true';
    if (cols.has('is_public')) publicExpr = 'COALESCE(is_public,true)';
    else if (cols.has('public')) publicExpr = 'COALESCE(public,true)';
    else if (cols.has('visibility'))
      publicExpr = `(COALESCE(visibility,'public') = 'public')`;
    else if (cols.has('access')) publicExpr = `(COALESCE(access,'public') = 'public')`;

    const selectOwner = ownerCol
      ? `"${ownerCol}" AS owner_user_id`
      : 'NULL::int AS owner_user_id';

    const q = await pool.query(
      `
      SELECT
        id,
        (${sandboxExpr})::boolean AS is_sandbox,
        (${publicExpr})::boolean AS is_public,
        ${selectOwner}
      FROM ${table}
      WHERE id = $1
      LIMIT 1
      `,
      [courseId],
    );

    if (q.rowCount) {
      const row = q.rows[0];
      return {
        found: true,
        table,
        isSandbox: !!row.is_sandbox,
        isPublic: !!row.is_public,
        ownerUserId: row.owner_user_id ?? null,
      };
    }
  }

  return { found: false };
}

export async function enforceAiCourseAccess(req, res, next) {
  try {
    const userId = req.user?.id || null;

    const courseId =
      req.body?.courseId || req.params?.courseId || req.query?.courseId || null;

    const assignmentId =
      (typeof req.body?.assignmentId === 'string' && req.body.assignmentId.trim()) ||
      (typeof req.query?.assignmentId === 'string' && req.query.assignmentId.trim()) ||
      res.locals?.assignment?.id ||
      null;

    const assignmentOrgId = res.locals?.assignment?.orgId || null;

    const anonIdRaw =
      req.get('x-anon-id') || req.body?.anonId || req.query?.anonId || '';

    const anonId = String(anonIdRaw || '').trim() || null;

    // Preview definition (your existing behavior)
    const start = Number(req.body?.start ?? 0);
    const count = Number(req.body?.count ?? 1);
    const isPreview = start === 0 && count === 1;

    // 0) Assignment/org flow: org pays, no personal purchase needed (but still must be authed)
    if (assignmentOrgId || assignmentId) {
      if (!userId) {
        return res.status(401).json({ error: 'LOGIN_REQUIRED' });
      }
      return next();
    }

    if (!courseId) {
      return res.status(400).json({ error: 'MISSING_COURSE_ID' });
    }

    // 1) Determine course access type
    const meta = await getCourseAccessMeta(courseId);
    if (!meta.found) {
      return res.status(404).json({ error: 'COURSE_NOT_FOUND' });
    }

    const isPrivate = meta.isSandbox || meta.isPublic === false;

    // 2) Private/sandbox/self-serve: keep your entitlement enforcement
    if (isPrivate) {
      if (!userId) {
        return res.status(401).json({ error: 'LOGIN_REQUIRED' });
      }

      // Optional owner check if your schema supports it
      if (
        meta.ownerUserId != null &&
        Number.isFinite(Number(meta.ownerUserId)) &&
        Number.isFinite(Number(userId)) &&
        Number(meta.ownerUserId) !== Number(userId)
      ) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }

      const ent = await getCertificateEntitlement(userId, courseId);

      // Keep your existing preview rule: allow start=0,count=1 without entitlement
      if (!ent && !isPreview) {
        return res.status(402).json({
          error: 'COURSE_NOT_PURCHASED',
          cost_tokens: 20,
          message: 'Buy course access to unlock full narration and lesson generation.',
        });
      }

      res.locals.aiEntitlement = ent || null;
      res.locals.courseAccess = { kind: 'private', meta };
      return next();
    }

    // 3) Public/top course: allow anon SSML (requires anonId for identity + gating)
    if (!userId) {
      if (!anonId) {
        return res.status(401).json({
          error: 'ANON_ID_REQUIRED',
          message: 'Send X-Anon-Id (persisted UUID) or sign in.',
        });
      }
      res.locals.anonId = anonId;
      res.locals.aiEntitlement = null; // no entitlement for anon
      res.locals.courseAccess = { kind: 'public', meta };
      return next();
    }

    // 4) Public + authed: entitlement is optional (do NOT block if missing)
    try {
      const ent = await getCertificateEntitlement(userId, courseId);
      res.locals.aiEntitlement = ent || null;
    } catch {
      res.locals.aiEntitlement = null;
    }
    res.locals.courseAccess = { kind: 'public', meta };
    return next();
  } catch (err) {
    console.error('[enforceAiCourseAccess] error', err);
    return res.status(500).json({ error: 'ACCESS_CHECK_FAILED' });
  }
}

export default enforceAiCourseAccess;
