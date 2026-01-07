import pool from '../config/db.js';
import { renderOrgAiSubmissionsPdf } from '../services/orgAiSubmissionsPdfService.js';

function cleanLabel(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateParam(value, label) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`Invalid ${label} date`);
    err.status = 400;
    throw err;
  }
  return d.toISOString();
}

function safeFilenamePart(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '-');
}

async function loadOrgMeta(orgId) {
  const { rows } = await pool.query(
    `
      SELECT
        id,
        name,
        logo_url,
        contact_email,
        phone_number,
        address_line1,
        address_line2,
        website_url
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [orgId],
  );

  return rows[0] || null;
}

export async function getOrgAiSubmissionsPdf(req, res) {
  const orgIdParam = req.params.orgId;
  const viewerUserId = req.user?.id;

  if (!orgIdParam) return res.status(400).json({ ok: false, message: 'Missing orgId' });
  if (!viewerUserId) return res.status(401).json({ ok: false, message: 'Unauthorized' });

  try {
    const mem = await pool.query(
      `
      SELECT role
      FROM org_memberships
      WHERE org_id = $1::uuid
        AND user_id = $2::bigint
        AND role IN ('owner','admin','instructor')
      LIMIT 1
      `,
      [orgIdParam, viewerUserId],
    );

    if (!mem.rowCount) return res.status(403).json({ ok: false, message: 'Forbidden' });

    const role = mem.rows[0]?.role;
    let createdByFilter = null;
    if (role === 'instructor') {
      createdByFilter = viewerUserId;
    }

    const classLabelRaw =
      req.query.classId || req.query.class_id || req.query.class_label || null;
    const classLabel = cleanLabel(classLabelRaw) || null;

    const rangeFrom = parseDateParam(req.query.from, 'from');
    const rangeTo = parseDateParam(req.query.to, 'to');

    const org = await loadOrgMeta(orgIdParam);
    if (!org) return res.status(404).json({ ok: false, message: 'Org not found' });

    const { rows } = await pool.query(
      `
        SELECT
          qa.id AS attempt_id,
          qa.submitted_at,
          qa.score_pct,
          COALESCE(u.name, u.email, 'Learner') AS learner_display_name,
          u.email AS learner_email,
          lp.class_label AS learner_class_label,
          a.org_class_label AS assignment_class_label
        FROM org_quiz_attempts qa
        INNER JOIN org_course_assignments a
          ON a.id::text = qa.assignment_id::text
         AND a.org_id::text = qa.org_id::text
        LEFT JOIN users u
          ON u.id = qa.user_id
        LEFT JOIN org_learner_profiles lp
          ON lp.org_id::text = qa.org_id::text
         AND lp.user_id = qa.user_id
        WHERE qa.org_id::text = $1::text
          AND qa.status = 'submitted'
          AND qa.submitted_at IS NOT NULL
          AND ($2::bigint IS NULL OR a.created_by = $2::bigint)
          AND (
            $3::text IS NULL
            OR lp.class_label = $3::text
            OR a.org_class_label = $3::text
          )
          AND ($4::timestamptz IS NULL OR qa.submitted_at >= $4::timestamptz)
          AND ($5::timestamptz IS NULL OR qa.submitted_at <= $5::timestamptz)
        ORDER BY COALESCE(u.name, u.email) ASC, qa.submitted_at DESC
      `,
      [orgIdParam, createdByFilter, classLabel, rangeFrom, rangeTo],
    );

    const pdfBuffer = await renderOrgAiSubmissionsPdf({
      org,
      classLabel,
      rows,
      rangeFrom,
      rangeTo,
    });

    const safeClass = classLabel ? safeFilenamePart(classLabel) : 'all-classes';
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `ai-quiz-results-${safeClass}-${stamp}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (err) {
    const status = err?.status || 500;
    console.error('[getOrgAiSubmissionsPdf] error', {
      message: err?.message,
      status,
      detail: err?.detail,
      stack: err?.stack,
      orgIdParam,
      viewerUserId,
    });
    return res
      .status(status)
      .json({ ok: false, message: err?.message || 'Failed to generate PDF' });
  }
}
