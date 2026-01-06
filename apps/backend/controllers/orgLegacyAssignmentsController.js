// apps/backend/controllers/orgLegacyAssignmentsController.js
import 'dotenv/config';
import pool from '../config/db.js';
import { requireOrgTier } from '../utils/orgTierGuard.js';
import { randomBytes } from 'crypto';
/**
 * POST /api/orgs/:orgId/assignments/legacy
 * Body: { title, instructions?, class_label, subject_key, attachment_url?, due_at? }
 *
 * Uses org_course_assignments with course_id = NULL and source_kind = 'legacy'.
 */
export async function createOrgLegacyAssignment(req, res) {
  const { orgId } = req.params;
  const userId = req.user?.id;

  const {
    title,
    instructions,
    class_label,
    org_class_label,
    subject_key,
    org_subject_key,
    attachment_url,
    due_at,
    dueAt,
  } = req.body || {};

  const DEBUG =
    String(process.env.DEBUG_ORG_ASSIGNMENTS || '') === '1' ||
    String(process.env.NODE_ENV || '') !== 'production';

  const rid =
    req.get?.('x-request-id') ||
    req.headers?.['x-request-id'] ||
    randomBytes(6).toString('hex');

  const tag = (m) => `[org.createAssignment(classic) ${rid}] ${m}`;
  const log = (...a) => DEBUG && console.log(tag(''), ...a);
  const warn = (...a) => console.warn(tag('WARN'), ...a);
  const errlog = (...a) => console.error(tag('ERROR'), ...a);

  log('incoming', {
    orgId,
    userId,
    bodyKeys: Object.keys(req.body || {}),
    title,
    class_label,
    org_class_label,
    subject_key,
    org_subject_key,
    due_at,
    dueAt,
    hasAttachment: Boolean(attachment_url),
  });

  if (!orgId) return res.status(400).json({ ok: false, message: 'Missing orgId in URL.' });
  if (!userId) return res.status(401).json({ ok: false, message: 'Not authenticated.' });

  // staff gate
  const mem = await pool.query(
    `SELECT role
       FROM org_memberships
      WHERE org_id=$1 AND user_id=$2
        AND role IN ('owner','admin','instructor')
      LIMIT 1`,
    [orgId, userId],
  );

  log('membership.check', { rowCount: mem.rowCount, role: mem.rows?.[0]?.role || null });
  if (!mem.rowCount) return res.status(403).json({ ok: false, message: 'Forbidden' });

  const trimmedTitle = String(title || '').trim();
  const classLabel = String(org_class_label || class_label || '').trim();
  const subjectKey = String(org_subject_key || subject_key || '').trim();

  if (!trimmedTitle) {
    warn('validation: missing title');
    return res.status(400).json({ ok: false, message: 'Assignment title is required.' });
  }
  if (!classLabel || !subjectKey) {
    warn('validation: missing classLabel/subjectKey', { classLabel, subjectKey });
    return res.status(400).json({
      ok: false,
      message: 'Both class_label and subject_key are required.',
    });
  }

  let dueAtValue = null;
  const rawDue = due_at || dueAt || null;
  if (rawDue) {
    const d = new Date(rawDue);
    if (Number.isNaN(d.getTime())) {
      warn('validation: invalid due_at', { rawDue });
      return res.status(400).json({
        ok: false,
        message: 'Invalid due_at format. Use a valid ISO string or leave blank.',
      });
    }
    dueAtValue = d.toISOString();
  }

  // ✅ legacy assignments should NOT generate invite_code
  const inviteCode = null;

  try {
    // quick visibility: how many legacy assignments already exist
    const pre = await pool.query(
      `SELECT COUNT(*)::int AS c
         FROM org_course_assignments
        WHERE org_id=$1
          AND (COALESCE(source_kind,'')='legacy' OR course_id IS NULL)`,
      [orgId],
    );
    log('pre.classicCount', { classicCount: pre.rows?.[0]?.c ?? 0 });

    // ✅ insert legacy assignment with NULL course_id + NULL invite_code
    const { rows } = await pool.query(
      `
      INSERT INTO org_course_assignments (
        org_id,
        created_by,
        title,
        instructions,
        class_label,
        subject_key,
        org_class_label,
        org_subject_key,
        attachment_url,
        due_at,
        course_id,
        invite_code,
        source_kind,
        created_at,
        updated_at
      ) VALUES (
        $1::uuid,
        $2::bigint,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        NULL,        -- ✅ legacy has no course
        NULL,        -- ✅ legacy has no invite code
        'legacy',    -- ✅ explicit
        NOW(),
        NOW()
      )
      RETURNING *
      `,
      [
        orgId,
        userId,
        trimmedTitle,
        instructions ? String(instructions).trim() : null,
        classLabel,
        subjectKey,
        classLabel, // keep both labels aligned
        subjectKey, // keep both keys aligned
        attachment_url || null,
        dueAtValue,
      ],
    );

    const assignment = rows[0];

    log('created', {
      id: assignment?.id,
      org_id: assignment?.org_id,
      source_kind: assignment?.source_kind,
      title: assignment?.title,
      invite_code: assignment?.invite_code, // should be null
      due_at: assignment?.due_at,
      created_by: assignment?.created_by,
      created_at: assignment?.created_at,
    });

    return res.status(201).json({ ok: true, assignment });
  } catch (err) {
    errlog('failed', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      constraint: err?.constraint,
      stack: err?.stack,
    });
    return res.status(500).json({ ok: false, message: 'Failed to create legacy assignment.' });
  }
}

export async function getOrgAssignments(req, res) {
  const userId = req.user?.id;
  const { orgId } = req.params;

  const DEBUG =
    String(process.env.DEBUG_ORG_ASSIGNMENTS || '') === '1' ||
    String(process.env.NODE_ENV || '') !== 'production';

  const rid =
    req.get?.('x-request-id') ||
    req.headers?.['x-request-id'] ||
    (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(6).toString('hex'));

  const tag = (m) => `[org.getAssignments ${rid}] ${m}`;
  const log = (...a) => DEBUG && console.log(tag(''), ...a);
  const warn = (...a) => console.warn(tag('WARN'), ...a);
  const err = (...a) => console.error(tag('ERROR'), ...a);

  if (!orgId) return res.status(400).json({ ok: false, message: 'Missing org id' });
  if (!userId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  const view = String(req.query.view || '').toLowerCase();

  // filters (optional)
  let classLabel = String(req.query.classLabel ?? req.query.class_label ?? '').trim();
  let subjectKey = String(req.query.subjectKey ?? req.query.subject_key ?? '').trim();

  try {
    log('incoming', { orgId, userId, view, query: req.query });

    // must be member of org
    const mem = await pool.query(
      `SELECT role
         FROM org_memberships
        WHERE org_id = $1 AND user_id = $2
        LIMIT 1`,
      [orgId, userId],
    );

    log('membership', { rowCount: mem.rowCount, role: mem.rows?.[0]?.role || null });

    if (!mem.rowCount) return res.status(403).json({ ok: false, message: 'Forbidden' });

    const role = String(mem.rows?.[0]?.role || '').toLowerCase();

    // learner fallback
    if (role === 'learner' && !classLabel) {
      const lp = await pool.query(
        `SELECT class_label
           FROM org_learner_profiles
          WHERE org_id = $1 AND user_id = $2
          LIMIT 1`,
        [orgId, userId],
      );
      classLabel = String(lp.rows?.[0]?.class_label || '').trim();
      log('learner.classLabel.fallback', { classLabel });
    }

    const classLabelParam = classLabel ? classLabel : null;
    const subjectKeyParam = subjectKey ? subjectKey : null;

    // legacy table existence (optional)
    const legacyTblQ = await pool.query(
      `SELECT to_regclass('public.org_legacy_assignments') AS legacy_tbl`,
    );
    const legacyTbl = legacyTblQ.rows?.[0]?.legacy_tbl || null;

    log('filters.effective', {
      role,
      classLabel: classLabelParam,
      subjectKey: subjectKeyParam,
      legacyTblExists: Boolean(legacyTbl),
    });

    // counts (debug aid)
    const countsTotal = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (COALESCE(source_kind,'')='legacy' OR course_id IS NULL))::int AS classic_total,
        COUNT(*) FILTER (WHERE NOT (COALESCE(source_kind,'')='legacy' OR course_id IS NULL))::int AS ai_total
      FROM org_course_assignments
      WHERE org_id = $1
      `,
      [orgId],
    );

    const countsFiltered = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE (COALESCE(source_kind,'')='legacy' OR course_id IS NULL))::int AS classic_total,
        COUNT(*) FILTER (WHERE NOT (COALESCE(source_kind,'')='legacy' OR course_id IS NULL))::int AS ai_total
      FROM org_course_assignments
      WHERE org_id = $1
        AND ($2::text IS NULL OR org_class_label IS NULL OR LOWER(org_class_label) = LOWER($2))
        AND ($3::text IS NULL OR org_subject_key IS NULL OR LOWER(org_subject_key) = LOWER($3))
      `,
      [orgId, classLabelParam, subjectKeyParam],
    );

    log('counts', { total: countsTotal.rows?.[0], filtered: countsFiltered.rows?.[0] });

    const includeLegacyTable = String(req.query.includeLegacyTable || '') === '1' && legacyTbl;

    const values = [
      orgId, // $1
      userId, // $2
      classLabelParam, // $3
      subjectKeyParam, // $4
    ];

    // Main query (unified rows + correct submission stats + opened_at)
    // Fix: compute sort_at and ORDER BY sort_at (no alias-in-COALESCE bug)
    let queryText = `
      WITH base AS (
        SELECT
          a.id::text AS id,
          a.org_id::text AS org_id,
          a.created_at AS created_at,
          a.created_by AS created_by,

          COALESCE(a.title_override, c.title, 'Untitled assignment') AS title,
          a.title_override AS title_override,
          c.title AS course_title,
          a.course_id::text AS course_id,

          a.instructions AS instructions,
          a.attachment_url AS attachment_url,

          a.org_class_label AS org_class_label,
          a.org_subject_key AS org_subject_key,

          -- Back-compat aliases (some UIs read these)
          a.org_class_label::text AS class_label,
          a.org_subject_key::text AS subject_key,

          a.due_at AS due_at,

          COALESCE(
            a.source_kind,
            CASE WHEN a.course_id IS NULL THEN 'legacy' ELSE 'robot' END
          )::text AS source_kind,

          a.invite_code AS invite_code,

          a.pass_mark AS pass_mark,
          a.timer_s AS timer_s,
          a.max_attempts AS max_attempts
        FROM org_course_assignments a
        LEFT JOIN courses c
          ON c.id::text = a.course_id::text
        WHERE a.org_id = $1
          AND ($3::text IS NULL OR a.org_class_label IS NULL OR LOWER(a.org_class_label) = LOWER($3))
          AND ($4::text IS NULL OR a.org_subject_key IS NULL OR LOWER(a.org_subject_key) = LOWER($4))
      ),
      enriched AS (
        SELECT
          b.*,
          v.opened_at AS opened_at,

          -- TOTAL classic submissions (distinct learners)
          CASE
            WHEN b.source_kind = 'legacy' THEN COALESCE(cls_total.submission_count, 0)
            ELSE COALESCE(ai_total.submission_count, 0)
          END AS submission_count_total,

          CASE
            WHEN b.source_kind = 'legacy' THEN cls_total.latest_submission_at
            ELSE ai_total.latest_submission_at
          END AS latest_submission_at_total,

          CASE
            WHEN b.source_kind = 'legacy' THEN (COALESCE(cls_total.submission_count, 0) > 0)
            ELSE (COALESCE(ai_total.submission_count, 0) > 0)
          END AS has_submission_total,

          -- MY submissions (current viewer)
          CASE
            WHEN b.source_kind = 'legacy' THEN COALESCE(cls_my.submission_count, 0)
            ELSE COALESCE(ai_my.submission_count, 0)
          END AS my_submission_count,

          CASE
            WHEN b.source_kind = 'legacy' THEN cls_my.latest_submission_at
            ELSE ai_my.latest_submission_at
          END AS my_latest_submission_at,

          CASE
            WHEN b.source_kind = 'legacy' THEN (COALESCE(cls_my.submission_count, 0) > 0)
            ELSE (COALESCE(ai_my.submission_count, 0) > 0)
          END AS has_my_submission,

          -- ✅ sort key (fixes ORDER BY alias issue)
          COALESCE(
            CASE
              WHEN b.source_kind = 'legacy' THEN cls_total.latest_submission_at
              ELSE ai_total.latest_submission_at
            END,
            b.created_at
          ) AS sort_at

        FROM base b

        -- classic total
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT s.user_id)::int AS submission_count,
            MAX(s.submitted_at) AS latest_submission_at
          FROM org_course_assignment_submissions s
          WHERE s.org_id::text = b.org_id::text
            AND s.assignment_id::text = b.id::text
        ) cls_total ON TRUE

        -- classic my
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS submission_count,
            MAX(s.submitted_at) AS latest_submission_at
          FROM org_course_assignment_submissions s
          WHERE s.org_id::text = b.org_id::text
            AND s.assignment_id::text = b.id::text
            AND s.user_id = $2
        ) cls_my ON TRUE

        -- AI total (distinct learners who submitted at least once)
        LEFT JOIN LATERAL (
          SELECT
            COUNT(DISTINCT qa.user_id)::int AS submission_count,
            MAX(qa.submitted_at) AS latest_submission_at
          FROM org_quiz_attempts qa
          WHERE qa.org_id::text = b.org_id::text
            AND qa.assignment_id::text = b.id::text
            AND qa.status = 'submitted'
            AND qa.submitted_at IS NOT NULL
        ) ai_total ON TRUE

        -- AI my
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS submission_count,
            MAX(qa.submitted_at) AS latest_submission_at
          FROM org_quiz_attempts qa
          WHERE qa.org_id::text = b.org_id::text
            AND qa.assignment_id::text = b.id::text
            AND qa.user_id = $2
            AND qa.status = 'submitted'
            AND qa.submitted_at IS NOT NULL
        ) ai_my ON TRUE

        -- opened marker for THIS instructor
        LEFT JOIN org_assignment_views v
          ON v.org_id::text = b.org_id::text
         AND v.assignment_id::text = b.id::text
         AND v.instructor_user_id = $2
      )
      SELECT *
      FROM enriched
      ORDER BY sort_at DESC NULLS LAST
      LIMIT 300
    `;

    if (includeLegacyTable) {
      queryText = `
        WITH base AS (
          SELECT
            a.id::text AS id,
            a.org_id::text AS org_id,
            a.created_at AS created_at,
            a.created_by AS created_by,
            COALESCE(a.title_override, c.title, 'Untitled assignment') AS title,
            a.title_override AS title_override,
            c.title AS course_title,
            a.course_id::text AS course_id,
            a.instructions AS instructions,
            a.attachment_url AS attachment_url,
            a.org_class_label AS org_class_label,
            a.org_subject_key AS org_subject_key,
            a.org_class_label::text AS class_label,
            a.org_subject_key::text AS subject_key,
            a.due_at AS due_at,
            COALESCE(
              a.source_kind,
              CASE WHEN a.course_id IS NULL THEN 'legacy' ELSE 'robot' END
            )::text AS source_kind,
            a.invite_code AS invite_code,
            a.pass_mark AS pass_mark,
            a.timer_s AS timer_s,
            a.max_attempts AS max_attempts
          FROM org_course_assignments a
          LEFT JOIN courses c
            ON c.id::text = a.course_id::text
          WHERE a.org_id = $1
            AND ($3::text IS NULL OR a.org_class_label IS NULL OR LOWER(a.org_class_label) = LOWER($3))
            AND ($4::text IS NULL OR a.org_subject_key IS NULL OR LOWER(a.org_subject_key) = LOWER($4))
        ),
        enriched AS (
          SELECT
            b.*,
            v.opened_at AS opened_at,

            CASE WHEN b.source_kind='legacy' THEN COALESCE(cls_total.submission_count,0)
                 ELSE COALESCE(ai_total.submission_count,0) END AS submission_count_total,
            CASE WHEN b.source_kind='legacy' THEN cls_total.latest_submission_at
                 ELSE ai_total.latest_submission_at END AS latest_submission_at_total,
            CASE WHEN b.source_kind='legacy' THEN (COALESCE(cls_total.submission_count,0) > 0)
                 ELSE (COALESCE(ai_total.submission_count,0) > 0) END AS has_submission_total,

            CASE WHEN b.source_kind='legacy' THEN COALESCE(cls_my.submission_count,0)
                 ELSE COALESCE(ai_my.submission_count,0) END AS my_submission_count,
            CASE WHEN b.source_kind='legacy' THEN cls_my.latest_submission_at
                 ELSE ai_my.latest_submission_at END AS my_latest_submission_at,
            CASE WHEN b.source_kind='legacy' THEN (COALESCE(cls_my.submission_count,0) > 0)
                 ELSE (COALESCE(ai_my.submission_count,0) > 0) END AS has_my_submission,

            COALESCE(
              CASE WHEN b.source_kind='legacy' THEN cls_total.latest_submission_at
                   ELSE ai_total.latest_submission_at END,
              b.created_at
            ) AS sort_at

          FROM base b

          LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT s.user_id)::int AS submission_count,
                   MAX(s.submitted_at) AS latest_submission_at
            FROM org_course_assignment_submissions s
            WHERE s.org_id::text = b.org_id::text
              AND s.assignment_id::text = b.id::text
          ) cls_total ON TRUE

          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS submission_count,
                   MAX(s.submitted_at) AS latest_submission_at
            FROM org_course_assignment_submissions s
            WHERE s.org_id::text = b.org_id::text
              AND s.assignment_id::text = b.id::text
              AND s.user_id = $2
          ) cls_my ON TRUE

          LEFT JOIN LATERAL (
            SELECT COUNT(DISTINCT qa.user_id)::int AS submission_count,
                   MAX(qa.submitted_at) AS latest_submission_at
            FROM org_quiz_attempts qa
            WHERE qa.org_id::text = b.org_id::text
              AND qa.assignment_id::text = b.id::text
              AND qa.status='submitted'
              AND qa.submitted_at IS NOT NULL
          ) ai_total ON TRUE

          LEFT JOIN LATERAL (
            SELECT COUNT(*)::int AS submission_count,
                   MAX(qa.submitted_at) AS latest_submission_at
            FROM org_quiz_attempts qa
            WHERE qa.org_id::text = b.org_id::text
              AND qa.assignment_id::text = b.id::text
              AND qa.user_id = $2
              AND qa.status='submitted'
              AND qa.submitted_at IS NOT NULL
          ) ai_my ON TRUE

          LEFT JOIN org_assignment_views v
            ON v.org_id::text = b.org_id::text
           AND v.assignment_id::text = b.id::text
           AND v.instructor_user_id = $2
        ),
        legacy_rows AS (
          SELECT
            la.id::text                 AS id,
            la.org_id::text             AS org_id,
            la.created_at               AS created_at,
            la.created_by               AS created_by,
            la.title::text              AS title,
            NULL::text                  AS title_override,
            NULL::text                  AS course_title,
            NULL::text                  AS course_id,
            la.instructions::text       AS instructions,
            la.attachment_url::text     AS attachment_url,
            la.class_label::text        AS org_class_label,
            la.subject_key::text        AS org_subject_key,
            la.class_label::text        AS class_label,
            la.subject_key::text        AS subject_key,
            la.due_at                   AS due_at,
            'legacy_table'::text        AS source_kind,
            NULL::text                  AS invite_code,
            NULL::int                   AS pass_mark,
            NULL::int                   AS timer_s,
            NULL::int                   AS max_attempts,
            NULL::timestamptz           AS opened_at,
            0::int                      AS submission_count_total,
            NULL::timestamptz           AS latest_submission_at_total,
            false                       AS has_submission_total,
            0::int                      AS my_submission_count,
            NULL::timestamptz           AS my_latest_submission_at,
            false                       AS has_my_submission,
            la.created_at               AS sort_at
          FROM org_legacy_assignments la
          WHERE la.org_id::text = $1::text
            AND ($3::text IS NULL OR la.class_label IS NULL OR LOWER(la.class_label) = LOWER($3))
            AND ($4::text IS NULL OR la.subject_key IS NULL OR LOWER(la.subject_key) = LOWER($4))
        )
        SELECT * FROM enriched
        UNION ALL
        SELECT * FROM legacy_rows
        ORDER BY sort_at DESC NULLS LAST
        LIMIT 300
      `;
      log('legacy union enabled', { legacyTbl });
    }

    const { rows } = await pool.query(queryText, values);

    const isLearnerView = role === 'learner' || view === 'learner';

    // Preserve old semantics for learners, but fix instructor/admin totals
    const normalized = rows.map((r) => {
      const out = { ...r };

      if (isLearnerView) {
        out.submission_count = Number(r.my_submission_count || 0);
        out.latest_submission_at = r.my_latest_submission_at || null;
        out.has_submission = Boolean(r.has_my_submission);
      } else {
        out.submission_count = Number(r.submission_count_total || 0);
        out.latest_submission_at = r.latest_submission_at_total || null;
        out.has_submission = Boolean(r.has_submission_total);
      }

      return out;
    });

    log('result', {
      count: normalized.length,
      withSubs: normalized.filter((r) => Number(r.submission_count || 0) > 0).length,
      sample: normalized[0],
    });

    const includeDebug =
      String(req.query.debug || '') === '1' ||
      String(process.env.DEBUG_ORG_ASSIGNMENTS_RESPONSE || '') === '1';

    return res.json({
      ok: true,
      data: normalized,
      ...(includeDebug
        ? {
            debug: {
              rid,
              role,
              view,
              filters: { classLabel: classLabelParam, subjectKey: subjectKeyParam },
              counts: {
                total: countsTotal.rows?.[0] || null,
                filtered: countsFiltered.rows?.[0] || null,
              },
              legacyTblExists: Boolean(legacyTbl),
              legacyTblName: legacyTbl,
              unionLegacyEnabled: Boolean(includeLegacyTable),
              isLearnerView,
            },
          }
        : null),
    });
  } catch (e) {
    err('failed', {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      stack: e?.stack,
      orgId,
      userId,
      query: req.query,
    });
    return res.status(500).json({ ok: false, message: 'Server error' });
  }
}

/**
 * POST /api/orgs/:orgId/assignments/:assignmentId/legacy/submit
 * Body: { answer_text?, attachment_url? }
 *
 * Uses org_course_assignment_submissions table.
 */
export async function submitOrgLegacyAssignment(req, res) {
  try {
    const orgId = req.params.orgId; // 👈 keep as string (UUID)
    const assignmentId = req.params.assignmentId;

    if (!orgId || !assignmentId) {
      return res.status(400).json({ ok: false, message: 'Invalid ids' });
    }

    const { answer_text, attachment_url } = req.body || {};

    const trimmedAnswer = (answer_text || '').toString().trim();
    const attachmentUrl = attachment_url || null;

    if (!trimmedAnswer && !attachmentUrl) {
      return res.status(400).json({
        ok: false,
        message: 'Provide answer_text or attachment_url before submitting.',
      });
    }

    // Make sure assignment belongs to this org
    const { rows: aRows } = await pool.query(
      `
      SELECT org_id
      FROM org_course_assignments
      WHERE id = $1
      `,
      [assignmentId], // <-- assignmentId as UUID string
    );

    if (
      !aRows.length ||
      String(aRows[0].org_id) !== String(orgId) // string compare
    ) {
      return res.status(404).json({
        ok: false,
        message: 'Assignment not found for this institution.',
      });
    }

    // identity from auth middleware
    const learnerId = req.orgLearner?.id || null;
    const userId = req.user?.id || null;
    const studentId =
      req.orgLearner?.admission_code ||
      req.query.studentId ||
      req.body.studentId ||
      null;

    const params = [
      orgId, // 👈 UUID
      assignmentId, // 👈 UUID
      learnerId,
      userId,
      studentId,
      trimmedAnswer || null,
      attachmentUrl,
    ];

    const { rows } = await pool.query(
      `
      INSERT INTO org_course_assignment_submissions (
        org_id,
        assignment_id,
        learner_id,
        user_id,
        student_id,
        answer_text,
        attachment_url
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING
        id,
        org_id,
        assignment_id,
        learner_id,
        user_id,
        student_id,
        answer_text,
        attachment_url,
        submitted_at
      `,
      params,
    );

    return res.status(201).json({
      ok: true,
      submission: rows[0],
    });
  } catch (err) {
    console.error('[submitOrgLegacyAssignment] error:', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      stack: err?.stack,
    });

    if (err?.code === '22P02') {
      // nicer message for bad UUID / type mismatch
      return res.status(400).json({
        ok: false,
        message: 'Bad id format when saving submission (id type mismatch).',
      });
    }

    return res
      .status(500)
      .json({ ok: false, message: 'Failed to submit assignment.' });
  }
}

export async function markOrgAssignmentOpened(req, res) {
  const orgIdParam = req.params.orgId;
  const assignmentIdParam = req.params.assignmentId;
  const instructorUserId = req.user?.id;

  if (!orgIdParam || !assignmentIdParam) {
    return res.status(400).json({ ok: false, message: 'Missing orgId or assignmentId' });
  }
  if (!instructorUserId) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    // ✅ optional but recommended security gate
    const mem = await pool.query(
      `
      SELECT 1
      FROM org_memberships
      WHERE org_id = $1::uuid
        AND user_id = $2::bigint
        AND role IN ('owner','admin','instructor')
      LIMIT 1
      `,
      [orgIdParam, instructorUserId],
    );

    if (!mem.rowCount) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO public.org_assignment_views (org_id, assignment_id, instructor_user_id, opened_at)
      VALUES ($1::uuid, $2::uuid, $3::bigint, now())
      ON CONFLICT (org_id, assignment_id, instructor_user_id)
      DO UPDATE SET opened_at = EXCLUDED.opened_at
      RETURNING opened_at
      `,
      [orgIdParam, assignmentIdParam, instructorUserId],
    );

    return res.json({
      ok: true,
      opened_at: rows[0]?.opened_at || new Date().toISOString(),
    });
  } catch (e) {
    console.error('[markOrgAssignmentOpened] error', e);
    return res.status(500).json({ ok: false, message: 'Failed to mark opened.' });
  }
}

export async function getOrgAssignmentSubmissions(req, res) {
  const orgIdParam = req.params.orgId;
  const assignmentIdParam = req.params.assignmentId;
  const viewerUserId = req.user?.id;

  console.log('[getOrgAssignmentSubmissions] params', { orgIdParam, assignmentIdParam });

  if (!orgIdParam || !assignmentIdParam) {
    return res.status(400).json({ ok: false, message: 'Missing orgId or assignmentId' });
  }
  if (!viewerUserId) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  try {
    // ✅ security gate
    const mem = await pool.query(
      `
      SELECT 1
      FROM org_memberships
      WHERE org_id = $1::uuid
        AND user_id = $2::bigint
        AND role IN ('owner','admin','instructor')
      LIMIT 1
      `,
      [orgIdParam, viewerUserId],
    );
    if (!mem.rowCount) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    // 1) Fetch assignment meta (NO a.kind column usage — we derive it)
    const aQ = await pool.query(
      `
      SELECT
        a.*,
        c.title AS course_title,
        COALESCE(
          a.source_kind,
          CASE WHEN a.course_id IS NULL THEN 'legacy' ELSE 'robot' END
        )::text AS source_kind,
        -- back-compat alias for older clients that expect "kind"
        COALESCE(
          a.source_kind,
          CASE WHEN a.course_id IS NULL THEN 'legacy' ELSE 'robot' END
        )::text AS kind,
        v.opened_at AS opened_at
      FROM org_course_assignments a
      LEFT JOIN courses c
        ON c.id::text = a.course_id::text
      LEFT JOIN org_assignment_views v
        ON v.org_id = $1::uuid
       AND v.assignment_id = $2::uuid
       AND v.instructor_user_id = $3::bigint
      WHERE a.org_id::text = $1::text
        AND a.id::text = $2::text
      LIMIT 1
      `,
      [orgIdParam, assignmentIdParam, viewerUserId],
    );

    if (!aQ.rowCount) {
      return res.status(404).json({ ok: false, message: 'Assignment not found.' });
    }

    const assignment = aQ.rows[0];

    const sourceKind = String(assignment.source_kind || assignment.kind || '').toLowerCase();

    // ✅ AI requires a course_id (invite_code alone is NOT enough; you already have legacy rows with invite_code)
    const isAi =
      sourceKind !== 'legacy' &&
      sourceKind !== 'classic' &&
      assignment.course_id != null &&
      (assignment.invite_code || assignment.course_id);

    // 2) Load submissions depending on AI vs classic
    let submissions = [];

    if (!isAi) {
      // Classic / legacy submissions
      const sQ = await pool.query(
        `
        SELECT
          s.id,
          s.user_id,
          s.student_id,
          s.answer_text,
          s.attachment_url,
          s.submitted_at AS submitted_at,

          COALESCE(u.name, u.email, 'Learner') AS learner_display_name,
          u.email AS learner_email,
          COALESCE(lp.admission_code, s.student_id) AS admission_number,
          lp.admission_code AS learner_admission_code
        FROM org_course_assignment_submissions s
        LEFT JOIN users u
          ON u.id = s.user_id
        LEFT JOIN org_learner_profiles lp
          ON lp.org_id::text = s.org_id::text
         AND lp.user_id = s.user_id
        WHERE s.org_id::text = $1::text
          AND s.assignment_id::text = $2::text
        ORDER BY s.submitted_at DESC NULLS LAST
        `,
        [orgIdParam, assignmentIdParam],
      );

      submissions = sQ.rows;
    } else {
      // AI submissions (aggregate quiz attempts)
      // ✅ use qa.score_pct (your earlier code already confirmed this column exists)
      const aiQ = await pool.query(
        `
        WITH agg AS (
          SELECT
            qa.user_id,
            COUNT(*)::int AS ai_attempts_count,
            MAX(qa.submitted_at) AS ai_last_attempt_at
          FROM org_quiz_attempts qa
          WHERE qa.org_id::text = $1::text
            AND qa.assignment_id::text = $2::text
            AND qa.status = 'submitted'
            AND qa.submitted_at IS NOT NULL
          GROUP BY qa.user_id
        ),
        last_attempt AS (
          SELECT DISTINCT ON (qa.user_id)
            qa.user_id,
            qa.submitted_at,
            qa.score_pct::float AS ai_final_score
          FROM org_quiz_attempts qa
          WHERE qa.org_id::text = $1::text
            AND qa.assignment_id::text = $2::text
            AND qa.status = 'submitted'
            AND qa.submitted_at IS NOT NULL
          ORDER BY qa.user_id, qa.submitted_at DESC
        )
        SELECT
          agg.user_id,
          COALESCE(u.name, u.email, 'Learner') AS learner_display_name,
          u.email AS learner_email,
          lp.admission_code AS learner_admission_code,
          lp.admission_code AS admission_number,
          agg.ai_attempts_count,
          agg.ai_last_attempt_at,
          la.ai_final_score
        FROM agg
        LEFT JOIN last_attempt la
          ON la.user_id = agg.user_id
        LEFT JOIN users u
          ON u.id = agg.user_id
        LEFT JOIN org_learner_profiles lp
          ON lp.org_id::text = $1::text
         AND lp.user_id = agg.user_id
        ORDER BY agg.ai_last_attempt_at DESC NULLS LAST
        `,
        [orgIdParam, assignmentIdParam],
      );

      submissions = aiQ.rows;
    }

    return res.json({
      ok: true,
      assignment,
      submissions,
    });
  } catch (e) {
    console.error('[getOrgAssignmentSubmissions] error', {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      stack: e?.stack,
      orgIdParam,
      assignmentIdParam,
    });
    return res.status(500).json({ ok: false, message: 'Failed to load submissions.' });
  }
}
