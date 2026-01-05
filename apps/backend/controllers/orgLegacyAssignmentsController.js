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

  console.log('[createOrgLegacyAssignment] body=', req.body);

  if (!orgId) {
    return res
      .status(400)
      .json({ ok: false, message: 'Missing orgId in URL.' });
  }

  // Basic auth/permissions check – mirror whatever you use for createOrgAssignment
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ ok: false, message: 'Not authenticated.' });
  }

  // Normalise class/subject keys so it matches your React payload
  const classLabel = String(org_class_label || class_label || '').trim();
  const subjectKey = String(org_subject_key || subject_key || '').trim();

  const trimmedTitle = String(title || '').trim();

  if (!trimmedTitle) {
    return res
      .status(400)
      .json({ ok: false, message: 'Assignment title is required.' });
  }
  if (!classLabel || !subjectKey) {
    return res.status(400).json({
      ok: false,
      message: 'Both class_label and subject_key are required.',
    });
  }

  // Optional due date – accept either due_at or dueAt from client
  let dueAtValue = null;
  const rawDue = due_at || dueAt || null;
  if (rawDue) {
    const d = new Date(rawDue);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({
        ok: false,
        message:
          'Invalid due_at format. Use a valid ISO string or leave blank.',
      });
    }
    // We store as UTC ISO, your column is TIMESTAMPTZ
    dueAtValue = d.toISOString();
  }

  // IMPORTANT: this assumes course_id is nullable in org_course_assignments.
  // If your column is NOT NULL, run:
  //   ALTER TABLE org_course_assignments ALTER COLUMN course_id DROP NOT NULL;
  // apps/backend/controllers/orgLegacyAssignmentsController.js

  // ...rest of imports...
  // import { randomBytes } from 'crypto';  // you already added this above

  // ...
  const inviteCode = randomBytes(8).toString('hex');

  try {
    const { rows } = await pool.query(
      `
      INSERT INTO org_course_assignments (
        org_id,
        course_id,          -- legacy assignments don't link to a Robot Tutor course
        title_override,     -- 👈 use this instead of non-existent "title"
        invite_code,
        instructions,
        org_class_label,
        org_subject_key,
        attachment_url,
        source_kind,
        due_at,
        created_by          -- remove this if your table doesn't have it
      )
      VALUES (
        $1,
        NULL,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        'legacy',
        $8,
        $9
      )
      RETURNING *
      `,
      [
        orgId,
        trimmedTitle, // title_override
        inviteCode,
        instructions ? String(instructions).trim() : null,
        classLabel,
        subjectKey,
        attachment_url || null,
        dueAtValue,
        userId,
      ],
    );

    const assignment = rows[0];
    return res.status(201).json({ ok: true, assignment });
  } catch (err) {
    console.error('[createOrgLegacyAssignment] error:', err);
    return res.status(500).json({
      ok: false,
      message: 'Failed to create legacy assignment.',
    });
  }
}

/**
 * GET /api/orgs/:orgId/assignments
 * Query:
 *   view=learner|admin
 *   studentId?=...
 *   class?=...
 *   class_label?=...
 *   subject?=...
 *   subject_key?=...
 *
 * Uses org_course_assignments (both AI + legacy) and LEFT JOIN courses for title.
 */
export async function getOrgAssignments(req, res) {
  try {
    const orgId = req.params.orgId;
    if (!orgId) {
      return res.status(400).json({ ok: false, message: 'Missing org id' });
    }

    const {
      view = 'learner',
      studentId,
      class: classFromQuery,
      class_label,
      subject,
      subject_key,
    } = req.query || {};

    const normalizedView = String(view || 'learner').toLowerCase();
    const userId = req.user?.id || null;

    // ── Class + subject filters ────────────────────────────────
    let classLabel =
      (classFromQuery || class_label || '').toString().trim() || null;

    const subjectKey = (subject || subject_key || '').toString().trim() || null;

    let learnerId = null;

    // derive learner from studentId
    if (studentId) {
      try {
        const { rows: lrRows } = await pool.query(
          `
          SELECT id, class_label
          FROM org_learner_profiles
          WHERE org_id = $1
            AND (
              admission_code = $2
              OR CAST(user_id AS TEXT) = $2
              OR CAST(id AS TEXT) = $2
            )
          LIMIT 1
          `,
          [orgId, String(studentId)],
        );

        if (lrRows[0]) {
          learnerId = lrRows[0].id;
          if (!classLabel) {
            classLabel = lrRows[0].class_label || null;
          }
        }
      } catch (e) {
        console.warn(
          '[getOrgAssignments] deriving class from studentId failed',
          e?.message || e,
        );
      }
    }

    // prefer auth’d orgLearner
    if (!learnerId && req.orgLearner?.id) {
      learnerId = req.orgLearner.id;
      if (!classLabel) {
        classLabel = req.orgLearner.class_label || null;
      }
    }

    const studentIdText =
      (studentId && String(studentId)) ||
      (req.orgLearner && req.orgLearner.admission_code) ||
      null;

    // ── WHERE clause ───────────────────────────────────────────
    const params = [orgId];
    let whereClause = 'a.org_id = $1';

    if (classLabel) {
      params.push(classLabel);
      whereClause += ` AND a.org_class_label = $${params.length}`;
    }

    if (subjectKey) {
      params.push(subjectKey);
      whereClause += ` AND a.org_subject_key = $${params.length}`;
    }

    let sql;

    // ───────────────── Learner view (per-learner submissions) ─────────────
    if (normalizedView === 'learner') {
      const learnerIdIdx = params.length + 1;
      const studentIdIdx = params.length + 2;
      const userIdIdx = params.length + 3;

      params.push(learnerId, studentIdText, userId);

      sql = `
        SELECT
          a.id,
          a.org_id,
          a.course_id,
          a.title_override,
          a.instructions,
          a.pass_mark,
          a.timer_s,
          a.org_class_label,
          a.org_subject_key,
          a.attachment_url,
          a.due_at,
          a.invite_code,
          a.source_kind,
          a.created_at,
          a.updated_at,
          c.title AS course_title,
          COALESCE(sub.submission_count, 0) AS submission_count,
          sub.latest_submission_at
        FROM org_course_assignments a
        LEFT JOIN courses c ON c.id = a.course_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS submission_count,
            MAX(submitted_at) AS latest_submission_at
          FROM org_course_assignment_submissions s
          WHERE s.org_id = a.org_id
            AND s.assignment_id = a.id
            AND (
              ($${learnerIdIdx}::text IS NOT NULL AND s.learner_id::text = $${learnerIdIdx}::text)
              OR ($${studentIdIdx}::text IS NOT NULL AND s.student_id::text = $${studentIdIdx}::text)
              OR ($${userIdIdx}::text IS NOT NULL AND s.user_id::text = $${userIdIdx}::text)
            )
        ) sub ON TRUE
        WHERE ${whereClause}
        ORDER BY a.due_at NULLS LAST, a.created_at DESC
        LIMIT 200
      `;
    } else {
      const viewerUserIdIdx = params.length + 1;
      params.push(userId || null);

      // ───────────── Admin / instructor view – ALL submissions per assignment ────
      sql = `
        SELECT
          a.id,
          a.org_id,
          a.course_id,
          a.title_override,
          a.instructions,
          a.pass_mark,
          a.timer_s,
          a.org_class_label,
          a.org_subject_key,
          a.attachment_url,
          a.due_at,
          a.invite_code,
          a.source_kind,
          a.created_at,
          a.updated_at,
          c.title AS course_title,
          v.opened_at,
          COALESCE(sub.submission_count, 0) AS submission_count,
          sub.latest_submission_at
        FROM org_course_assignments a
        LEFT JOIN courses c ON c.id = a.course_id
        LEFT JOIN org_assignment_views v
          ON v.org_id = a.org_id
         AND v.assignment_id = a.id
         AND v.instructor_user_id = $${viewerUserIdIdx}
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) AS submission_count,
            MAX(submitted_at) AS latest_submission_at
          FROM org_course_assignment_submissions s
          WHERE s.org_id = a.org_id
            AND s.assignment_id = a.id
        ) sub ON TRUE
        WHERE ${whereClause}
        ORDER BY a.due_at NULLS LAST, a.created_at DESC
        LIMIT 200
      `;
    }

    const { rows } = await pool.query(sql, params);

    const data = rows.map((r) => {
      const submissionCountRaw = r.submission_count;
      const submissionCount =
        typeof submissionCountRaw === 'number'
          ? submissionCountRaw
          : Number(submissionCountRaw || 0);

      const latestSub = r.latest_submission_at || r.submitted_at || null;

      const hasSubmission =
        submissionCount > 0 || (latestSub != null && latestSub !== '');

      return {
        id: r.id,
        org_id: r.org_id,
        course_id: r.course_id,
        courseId: r.course_id,
        course_title: r.course_title,
        title: r.title_override || r.course_title || null,
        title_override: r.title_override,
        instructions: r.instructions,
        pass_mark: r.pass_mark,
        timer_s: r.timer_s,
        class_label: r.org_class_label,
        subject_key: r.org_subject_key,
        org_class_label: r.org_class_label,
        org_subject_key: r.org_subject_key,
        attachment_url: r.attachment_url,
        due_at: r.due_at,
        invite_code: r.invite_code,
        source_kind: r.source_kind || 'robot',
        created_at: r.created_at,
        updated_at: r.updated_at,
        opened_at: r.opened_at,

        // submission metadata
        submission_count: submissionCount,
        submissions_count: submissionCount,
        answers_count: submissionCount,
        has_submission: hasSubmission,
        hasSubmitted: hasSubmission,
        latest_submission_at: latestSub,
        my_submission_created_at: latestSub,
        submitted_at: latestSub,
      };
    });

    return res.json({
      ok: true,
      view: normalizedView,
      data,
      meta: {
        class_label: classLabel,
        subject_key: subjectKey,
        studentId: studentId || null,
        learnerId,
      },
    });
  } catch (err) {
    console.error('[getOrgAssignments] error', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      stack: err?.stack,
    });
    return res
      .status(500)
      .json({ ok: false, message: 'Failed to load assignments.' });
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
  const userId = req.user?.id;
  const { orgId, assignmentId } = req.params;

  if (!userId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  try {
    const mem = await pool.query(
      `SELECT 1 FROM org_memberships WHERE org_id = $1 AND user_id = $2 AND role IN ('owner','admin','instructor') LIMIT 1`,
      [orgId, userId],
    );

    if (!mem.rowCount) {
      return res.status(403).json({ ok: false, message: 'Forbidden' });
    }

    const { rows } = await pool.query(
      `INSERT INTO org_assignment_views (org_id, assignment_id, instructor_user_id, opened_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (org_id, assignment_id, instructor_user_id)
       DO UPDATE SET opened_at = EXCLUDED.opened_at
       RETURNING opened_at`,
      [orgId, assignmentId, userId],
    );

    return res.json({ ok: true, opened_at: rows[0]?.opened_at || new Date().toISOString() });
  } catch (err) {
    console.error('[markOrgAssignmentOpened] error', err);
    return res.status(500).json({ ok: false, message: 'Failed to mark assignment opened.' });
  }
}

export async function getOrgAssignmentSubmissions(req, res) {
  const { orgId, assignmentId } = req.params;

  console.log('[getOrgAssignmentSubmissions] params', {
    orgIdParam: orgId,
    assignmentIdParam: assignmentId,
  });

  try {
    if (!orgId || !assignmentId) {
      console.warn('[getOrgAssignmentSubmissions] missing ids', {
        orgId,
        assignmentId,
      });
      return res.status(400).json({ ok: false, message: 'Missing ids' });
    }

    // 1) Ensure assignment belongs to this org
    const { rows: aRows } = await pool.query(
      `
      SELECT
        id,
        org_id,
        title_override,
        org_class_label,
        org_subject_key,
        course_id,
        invite_code,
        source_kind,
        kind
      FROM org_course_assignments
      WHERE id = $1
      LIMIT 1
      `,
      [assignmentId],
    );

    console.log('[getOrgAssignmentSubmissions] assignment query result', {
      count: aRows.length,
      first: aRows[0],
    });

    if (!aRows.length || String(aRows[0].org_id) !== String(orgId)) {
      console.warn('[getOrgAssignmentSubmissions] assignment not in org', {
        orgIdParam: orgId,
        assignmentOrgId: aRows[0]?.org_id,
      });
      return res.status(404).json({
        ok: false,
        message: 'Assignment not found for this institution.',
      });
    }

    // 2) Load submissions + learner profile + user details
    console.log('[getOrgAssignmentSubmissions] querying submissions', {
      orgIdParam: orgId,
      assignmentIdParam: assignmentId,
    });

    const { rows } = await pool.query(
      `
      SELECT
        s.id,
        s.org_id,
        s.assignment_id,
        s.learner_id             AS submission_learner_id, -- raw submission FK
        s.user_id                AS submission_user_id,
        s.student_id,
        s.answer_text,
        s.attachment_url,
        s.submitted_at,

        -- resolved learner profile (handles legacy rows without learner_id)
        COALESCE(lp_res.learner_id, s.learner_id) AS learner_id,
        lp_res.class_label       AS learner_class_label,
        COALESCE(lp_res.admission_code, s.student_id) AS admission_number,
        lp_res.admission_code   AS learner_admission_code,
        lp_res.user_id           AS learner_user_id,

        -- resolved user identity
        COALESCE(u.name, u_email.name)       AS learner_name,
        COALESCE(u.email, u_email.email)     AS learner_email,
        COALESCE(u.name, u_email.name)       AS learner_display_name,
        split_part(COALESCE(u.name, u_email.name, ''), ' ', 1) AS learner_first_name,
        NULLIF(split_part(COALESCE(u.name, u_email.name, ''), ' ', 2), '') AS learner_last_name

      FROM org_course_assignment_submissions s

      -- prefer exact learner_id match, then user match, then admission/admission email fallback
      LEFT JOIN LATERAL (
        SELECT lp.id AS learner_id, lp.class_label, lp.admission_code, lp.user_id
        FROM org_learner_profiles lp
        WHERE lp.org_id = s.org_id
          AND (
            lp.id = s.learner_id
            OR (s.user_id IS NOT NULL AND lp.user_id = s.user_id)
            OR (
              s.student_id IS NOT NULL
              AND lp.admission_code IS NOT NULL
              AND lower(lp.admission_code) = lower(s.student_id)
            )
          )
        ORDER BY
          (lp.id = s.learner_id) DESC,
          (lp.user_id = s.user_id) DESC
        LIMIT 1
      ) lp_res ON TRUE

      LEFT JOIN users u
        ON u.id = COALESCE(lp_res.user_id, s.user_id)

      -- Legacy submissions may have stored email in student_id – use this as a last resort
      LEFT JOIN users u_email
        ON s.student_id IS NOT NULL
        AND lower(u_email.email) = lower(s.student_id)

      WHERE s.org_id = $1
        AND s.assignment_id = $2
      ORDER BY s.submitted_at DESC
      `,
      [orgId, assignmentId],
    );

    console.log('[getOrgAssignmentSubmissions] submissions result', {
      count: rows.length,
      sample: rows[0],
    });

    // AI score enrichment (latest submitted attempt per learner for this assignment)
    const assignment = aRows[0];
    const isAiAssignment = Boolean(
      assignment?.invite_code ||
        (assignment?.source_kind &&
          String(assignment.source_kind).toLowerCase().includes('robot')) ||
        (assignment?.kind && String(assignment.kind).toLowerCase().includes('robot')),
    );

    let rowsWithScores = rows;

    if (isAiAssignment && rows.length) {
      const userIds = Array.from(
        new Set(
          rows
            .map((r) => r.learner_user_id || r.submission_user_id)
            .filter(Boolean)
            .map((u) => u && u.toString()),
        ),
      );

      if (userIds.length) {
        const { rows: statsRows } = await pool.query(
          `
          SELECT
            qa.user_id,
            COUNT(*)::int AS attempts_count,
            MAX(qa.submitted_at) AS last_attempt_at,
            (ARRAY_AGG(qa.score_pct ORDER BY qa.submitted_at DESC))[1] AS latest_score_pct
          FROM org_quiz_attempts qa
          WHERE qa.org_id = $1
            AND qa.assignment_id = $2
            AND qa.status = 'submitted'
            AND qa.user_id = ANY($3::uuid[])
          GROUP BY qa.user_id
          `,
          [orgId, assignmentId, userIds],
        );

        const scoreByUserId = new Map(
          statsRows.map((r) => [String(r.user_id), r]),
        );

        rowsWithScores = rows.map((r) => {
          const userId = r.learner_user_id || r.submission_user_id;
          const stats = userId ? scoreByUserId.get(String(userId)) : null;

          return {
            ...r,
            ai_final_score:
              stats && stats.latest_score_pct != null
                ? Number(stats.latest_score_pct)
                : null,
            ai_attempts_count: stats?.attempts_count ?? null,
            ai_last_attempt_at: stats?.last_attempt_at
              ? new Date(stats.last_attempt_at).toISOString()
              : null,
          };
        });
      }
    }

    return res.json({
      ok: true,
      assignment,
      submissions: rowsWithScores,
    });
  } catch (err) {
    console.error('[getOrgAssignmentSubmissions] error', {
      message: err?.message,
      code: err?.code,
      detail: err?.detail,
      stack: err?.stack,
      orgIdParam: orgId,
      assignmentIdParam: assignmentId,
    });

    return res
      .status(500)
      .json({ ok: false, message: 'Failed to load submissions.' });
  }
}
