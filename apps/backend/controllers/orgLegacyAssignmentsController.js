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

    // Learner view → only legacy/file-based assignments
    if (normalizedView === 'learner') {
      params.push('legacy');
      whereClause += ` AND a.source_kind = $${params.length}`;
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
      // ───────────── Admin / instructor view – ALL submissions per assignment ────
      sql = `
        SELECT
          a.id,
          a.org_id,
          a.course_id,
          a.title_override,
          a.instructions,
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
        org_subject_key
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
        s.learner_id,        -- uuid FK → org_learner_profiles.id
        s.user_id,           -- legacy numeric user_id (if you still use it)
        s.student_id,
        s.answer_text,
        s.attachment_url,
        s.submitted_at,

        -- from learner profile
        lp.admission_code    AS learner_admission_code,
        lp.class_label       AS learner_class_label,

        -- from users table (actual name + email)
        u.name               AS learner_name,
        u.email              AS learner_email

      FROM org_course_assignment_submissions s
      LEFT JOIN org_learner_profiles lp
        ON lp.id = s.learner_id
      LEFT JOIN users u
        ON u.id = lp.user_id

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

    return res.json({
      ok: true,
      assignment: aRows[0],
      submissions: rows,
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
