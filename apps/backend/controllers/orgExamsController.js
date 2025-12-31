// apps/backend/controllers/orgExamsController.js
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import multer from 'multer';
import pool from '../config/db.js';
import { requireOrgTier } from '../utils/orgTierGuard.js';
import { getStudentExamCard } from '../services/orgExamCardService.js';
import {
  renderOrgExamStudentCardPdf,
  renderOrgExamClassReportPdf,
} from '../services/orgExamPdfService.js';
import {
  aiGenerateExamInsights,
  aiComputeExamSheet,
  aiTransformExamConfig,
} from '../services/orgExamAiService.js';
const upload = multer({ storage: multer.memoryStorage() });

/**
 * Upload local/memory files to Cloudinary for exam documents.
 * Supports images, videos, and "raw" docs (pdf, xlsx, csv, etc.).
 *
 * @param {Array} files – Multer files (each with `.buffer` and/or `.path`)
 * @returns {Promise<Array<{ url: string; public_id: string }>>}
 */
async function uploadExamDocsToCloudinary(files) {
  return Promise.all(
    files.map(async (file) => {
      const mime = file.mimetype || '';
      const resourceType = mime.startsWith('image/')
        ? 'image'
        : mime.startsWith('video/')
          ? 'video'
          : 'raw'; // pdf/xlsx/etc

      // 1) memoryStorage → file.buffer
      if (file.buffer) {
        return new Promise((resolve, reject) => {
          const opts = {
            resource_type: resourceType,
            folder: 'org_exam_docs',
            public_id: `auto/${Date.now()}_${file.originalname.replace(
              /\..+$/,
              '',
            )}`,
          };
          const stream = cloudinary.uploader.upload_stream(
            opts,
            (err, result) => {
              if (err) return reject(err);
              resolve({
                url: result.secure_url,
                public_id: result.public_id,
              });
            },
          );
          stream.end(file.buffer);
        });
      }

      // 2) diskStorage → file.path (if you ever switch storage)
      if (file.path) {
        const result = await cloudinary.uploader.upload(file.path, {
          resource_type: resourceType,
          folder: 'org_exam_docs',
          public_id: `auto/${Date.now()}_${path.basename(
            file.path,
            path.extname(file.path),
          )}`,
        });
        return { url: result.secure_url, public_id: result.public_id };
      }

      throw new Error('No file.buffer or file.path provided for upload');
    }),
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!UUID_RE.test(v)) return null;
  return v;
}

// Clamp a single subject remark to a short, neat string
function clampSubjectRemark(rawRemark, maxChars = 80) {
  const txt = (rawRemark ?? '').toString().trim();

  if (!txt) return '';

  if (txt.length <= maxChars) {
    return txt;
  }

  // Soft-clip on a word boundary if possible
  const clipped = txt.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');

  const trimmed =
    lastSpace > 20 ? clipped.slice(0, lastSpace).trimEnd() : clipped.trimEnd();

  return `${trimmed}…`;
}

// Helper: compute grade from bands
async function pickGrade(orgId, percent) {
  const { rows } = await pool.query(
    `
      SELECT grade, remark, min_percent, max_percent
      FROM org_exam_grading_bands
      WHERE org_id = $1
      ORDER BY sort_order ASC, min_percent DESC
    `,
    [orgId],
  );

  for (const row of rows) {
    if (
      percent >= Number(row.min_percent) &&
      percent <= Number(row.max_percent)
    ) {
      return { grade: row.grade, remark: row.remark || null };
    }
  }
  return { grade: 'N/A', remark: null };
}

/** GET /api/orgs/:orgId/exams/student/:studentId/card?sessionId=... */
export async function getOrgExamStudentCard(req, res, next) {
  try {
    const { orgId, studentId } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const card = await getStudentExamCard({
      orgId,
      sessionId,
      studentUserId: Number(studentId),
    });

    if (!card) {
      return res
        .status(404)
        .json({ ok: false, message: 'Report card not found' });
    }

    // Inject overall grade + remark from grading bands (if totalPercent available)
    if (card.summary && typeof card.summary.totalPercent === 'number') {
      const { grade, remark } = await pickGrade(
        orgId,
        card.summary.totalPercent,
      );
      card.summary.overallGrade = card.summary.overallGrade || grade;
      // add remark field for the "Remarks" section on the report
      card.summary.overallRemark = card.summary.overallRemark || remark || null;
    }

    // Preserve previous shape by including ok: true
    return res.json({
      ok: true,
      ...card,
    });
  } catch (err) {
    console.error('[getOrgExamStudentCard] error', err);
    return next(err);
  }
}

/** GET /api/orgs/:orgId/exams/student/:studentId/card.pdf?sessionId=... */
export async function downloadOrgExamStudentCardPdf(req, res, next) {
  try {
    const { orgId, studentId } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const card = await getStudentExamCard({
      orgId,
      sessionId,
      studentUserId: Number(studentId),
    });

    if (!card) {
      return res.status(404).json({ message: 'Report card not found' });
    }

    // Same grade injection used for JSON, so PDF has consistent grade/remark
    if (card.summary && typeof card.summary.totalPercent === 'number') {
      const { grade, remark } = await pickGrade(
        orgId,
        card.summary.totalPercent,
      );
      card.summary.overallGrade = card.summary.overallGrade || grade;
      card.summary.overallRemark = card.summary.overallRemark || remark || null;
    }

    const pdfBuffer = await renderOrgExamStudentCardPdf(card);

    const filenameSafeName =
      (card.student.name || 'student')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'report';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${filenameSafeName}-report-card.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[downloadOrgExamStudentCardPdf] error', err);
    return next(err);
  }
}

// ✅ Backwards-compatible alias if your routes still import getOrgExamStudentCardPdf
export const getOrgExamStudentCardPdf = downloadOrgExamStudentCardPdf;

/** GET /api/orgs/:orgId/exams/config */
export async function getOrgExamConfig(req, res, next) {
  try {
    const { orgId } = req.params;

    await requireOrgTier(orgId, ['pro', 'enterprise']); // 403 if starter

    const [orgRes, terms, sessions, bands] = await Promise.all([
      pool.query(
        `SELECT exam_report_title
         FROM organizations
         WHERE id = $1`,
        [orgId],
      ),
      pool.query(
        `SELECT id, label, year, is_active, created_at
         FROM org_exam_terms
         WHERE org_id = $1
         ORDER BY year DESC, created_at DESC`,
        [orgId],
      ),
      pool.query(
        `SELECT id, label, term_id, weight, starts_at, ends_at
         FROM org_exam_sessions
         WHERE org_id = $1
         ORDER BY created_at DESC`,
        [orgId],
      ),
      pool.query(
        `SELECT id, scheme_name, grade, min_percent, max_percent, remark, sort_order
         FROM org_exam_grading_bands
         WHERE org_id = $1
         ORDER BY scheme_name, sort_order ASC, min_percent DESC`,
        [orgId],
      ),
    ]);

    const reportTitle = orgRes.rows[0]?.exam_report_title ?? null;

    return res.json({
      ok: true,
      reportTitle, // 👈 NEW
      terms: terms.rows,
      sessions: sessions.rows,
      gradingBands: bands.rows,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orgs/:orgId/exams/config */
/** POST /api/orgs/:orgId/exams/config */
export async function upsertOrgExamConfig(req, res, next) {
  const client = await pool.connect();
  try {
    const { orgId } = req.params;
    const {
      terms = [],
      sessions = [],
      gradingBands = [],
      reportTitle, // 👈 NEW
    } = req.body || {};

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    // ─────────────────────────────────────────────
    // 1) Guard against duplicate (term_id + label)
    // ─────────────────────────────────────────────
    const seenSessionKeys = new Set();
    for (const s of sessions) {
      const termKey = s.term_id || 'no-term';
      const labelKey = String(s.label || '')
        .trim()
        .toLowerCase();
      if (!labelKey) continue;

      const key = `${termKey}::${labelKey}`;
      if (seenSessionKeys.has(key)) {
        const err = new Error(
          `You already have an exam called "${s.label}" under the same term. ` +
            'Please rename or remove duplicate exam entries before saving.',
        );
        err.status = 400;
        throw err;
      }
      seenSessionKeys.add(key);
    }

    await client.query('BEGIN');

    // 1b) Save default report card title on the org
    await client.query(
      `
      UPDATE organizations
      SET exam_report_title = $2
      WHERE id = $1
      `,
      [orgId, reportTitle ? reportTitle.toString().trim() : null],
    );

    // ─────────────────────────────────────────────
    // 2) Upsert TERMS (delete + insert) with ID mapping
    // ─────────────────────────────────────────────
    // We keep a mapping from clientId (including tmp-*) → real DB UUID
    const termIdMap = new Map();

    await client.query('DELETE FROM org_exam_terms WHERE org_id = $1', [orgId]);

    for (const t of terms) {
      const clientId = t.id ? String(t.id) : null;
      const safeId = asUuid(clientId); // null if tmp-... or invalid

      const { rows } = await client.query(
        `
        INSERT INTO org_exam_terms (id, org_id, label, year, is_active)
        VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, COALESCE($5, TRUE))
        RETURNING id
        `,
        [safeId, orgId, t.label, t.year, t.is_active],
      );

      const dbId = rows[0].id;
      if (clientId) {
        // map both the original client id and the db id back to db id
        termIdMap.set(clientId, dbId);
      }
      termIdMap.set(String(dbId), dbId);
    }

    // ─────────────────────────────────────────────
    // 3) Upsert SESSIONS (delete + insert) with ID + term_id sanitised
    // ─────────────────────────────────────────────
    await client.query('DELETE FROM org_exam_sessions WHERE org_id = $1', [
      orgId,
    ]);

    for (const s of sessions) {
      const clientSessionId = s.id ? String(s.id) : null;
      const safeSessionId = asUuid(clientSessionId); // null if tmp-...

      // term_id may be:
      //  - an existing UUID
      //  - a tmp-* id that we just inserted as a term
      //  - null
      let safeTermId = null;
      if (s.term_id) {
        const rawTermId = String(s.term_id);

        // Prefer the mapping from terms step (handles tmp-ids)
        const mapped = termIdMap.get(rawTermId);
        if (mapped) {
          safeTermId = mapped;
        } else {
          // Fallback: maybe it's already a real UUID from DB
          safeTermId = asUuid(rawTermId);
        }
      }

      await client.query(
        `
        INSERT INTO org_exam_sessions (
          id,
          org_id,
          term_id,
          label,
          weight,
          starts_at,
          ends_at
        )
        VALUES (
          COALESCE($1::uuid, gen_random_uuid()),
          $2,
          $3::uuid,
          $4,
          COALESCE($5, 1.0),
          $6,
          $7
        )
        `,
        [
          safeSessionId,
          orgId,
          safeTermId, // can be null; null::uuid is fine
          s.label,
          s.weight,
          s.starts_at || null,
          s.ends_at || null,
        ],
      );
    }

    // ─────────────────────────────────────────────
    // 4) Upsert GRADING BANDS (delete + insert) with safe ID
    // ─────────────────────────────────────────────
    await client.query('DELETE FROM org_exam_grading_bands WHERE org_id = $1', [
      orgId,
    ]);

    for (const [idx, b] of (gradingBands || []).entries()) {
      const clientBandId = b.id ? String(b.id) : null;
      const safeBandId = asUuid(clientBandId); // null if tmp-...

      await client.query(
        `
        INSERT INTO org_exam_grading_bands (
          id,
          org_id,
          scheme_name,
          grade,
          min_percent,
          max_percent,
          remark,
          sort_order
        )
        VALUES (
          COALESCE($1::uuid, gen_random_uuid()),
          $2,
          COALESCE($3, 'default'),
          $4,
          $5,
          $6,
          $7,
          $8
        )
        `,
        [
          safeBandId,
          orgId,
          b.scheme_name || 'default',
          b.grade,
          b.min_percent,
          b.max_percent,
          b.remark || null,
          b.sort_order ?? idx,
        ],
      );
    }

    // 🔚 COMMIT + re-fetch canonical config with real UUIDs
    await client.query('COMMIT');

    const [orgRes, termsRes, sessionsRes, bandsRes] = await Promise.all([
      pool.query(
        `
        SELECT exam_report_title
        FROM organizations
        WHERE id = $1
        `,
        [orgId],
      ),
      pool.query(
        `
        SELECT id, label, year, is_active, created_at
        FROM org_exam_terms
        WHERE org_id = $1
        ORDER BY year DESC, created_at DESC
        `,
        [orgId],
      ),
      pool.query(
        `
        SELECT id, label, term_id, weight, starts_at, ends_at
        FROM org_exam_sessions
        WHERE org_id = $1
        ORDER BY created_at DESC
        `,
        [orgId],
      ),
      pool.query(
        `
        SELECT id, scheme_name, grade, min_percent, max_percent, remark, sort_order
        FROM org_exam_grading_bands
        WHERE org_id = $1
        ORDER BY scheme_name, sort_order ASC, min_percent DESC
        `,
        [orgId],
      ),
    ]);

    const savedReportTitle = orgRes.rows[0]?.exam_report_title ?? null;

    // ✅ Return the updated config so the frontend gets real UUIDs + title
    return res.json({
      ok: true,
      reportTitle: savedReportTitle, // 👈 NEW
      terms: termsRes.rows,
      sessions: sessionsRes.rows,
      gradingBands: bandsRes.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.status) {
      return res.status(err.status).json({ ok: false, message: err.message });
    }
    return next(err);
  } finally {
    client.release();
  }
}

/** GET /api/orgs/:orgId/exams/sheet?sessionId=...&classLabel=... */
export async function getOrgExamSheet(req, res, next) {
  try {
    const { orgId } = req.params;
    const { sessionId, classLabel } = req.query;

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const { rows } = await pool.query(
      `SELECT
         r.id,
         r.student_user_id,
         u.name AS student_name,
         u.email AS student_email,
         r.class_label,
         r.subject,
         r.score,
         r.max_score,
         r.cat_score,           -- ✅ NEW
         r.exam_score,          -- ✅ NEW
         r.percent,
         r.grade,
         r.remark,
         r.teacher_initials,     -- ✅ NEW
         r.extra
       FROM org_exam_results r
       JOIN users u ON u.id = r.student_user_id
       WHERE r.org_id = $1
         AND r.session_id = $2
         AND ($3::text IS NULL OR r.class_label = $3)
       ORDER BY student_name ASC, subject ASC`,
      [orgId, sessionId, classLabel || null],
    );

    return res.json({ ok: true, rows });
  } catch (err) {
    next(err);
  }
}

/** POST /api/orgs/:orgId/exams/sheet */
export async function saveOrgExamSheet(req, res) {
  try {
    const paramOrgId = req.params && req.params.orgId;
    const orgId = paramOrgId || (req.org && req.org.id) || req.orgId;

    if (!orgId) {
      return res.status(401).json({ ok: false, message: 'Missing org context' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const { sessionId, classLabel, rows } = req.body || {};

    if (!sessionId) {
      return res.status(400).json({ ok: false, message: 'sessionId is required' });
    }
    if (!Array.isArray(rows)) {
      return res.status(400).json({ ok: false, message: 'rows must be an array' });
    }

    if (!rows.length) {
      return res.json({ ok: true, message: 'No rows to save' });
    }

    const normalized = rows
      .map((r) => {
        const rowIdRaw = r && r.id;
        const rowId =
          rowIdRaw != null && Number.isFinite(Number(rowIdRaw)) ? Number(rowIdRaw) : null;

        const studentIdRaw =
          r && (r.student_user_id != null ? r.student_user_id : r.studentId != null ? r.studentId : r.student_userId);
        const studentIdNum = Number(studentIdRaw);
        const student_user_id = Number.isFinite(studentIdNum) ? studentIdNum : null;

        const base = {
          id: rowId, // ✅ NEW
          student_user_id,
          subject: ((r && r.subject) || '').toString().trim(),
          score: r && r.score == null ? null : r ? Number(r.score) : null,
          max_score: r && r.max_score == null ? null : r ? Number(r.max_score) : null,
          class_label: (
            (classLabel || (r && (r.class_label || r.classLabel)) || '').toString().trim()
          ) || null,

          cat_score: r && r.cat_score == null ? null : r ? Number(r.cat_score) : null,
          exam_score: r && r.exam_score == null ? null : r ? Number(r.exam_score) : null,

          remark: (() => {
            const raw = (r && r.remark != null ? r.remark : '').toString().trim();
            return raw || null;
          })(),

          teacher_initials: (() => {
            const raw = (
              r && (r.teacher_initials != null ? r.teacher_initials : r.teacherInitials != null ? r.teacherInitials : '')
            )
              .toString()
              .trim();
            return raw || null;
          })(),
        };

        // ✅ Flexible extra columns
        let extra = {};
        if (r && r.extra && typeof r.extra === 'object' && !Array.isArray(r.extra)) {
          extra = { ...r.extra };
        } else {
          const knownKeys = new Set([
            'id',
            'student_user_id',
            'studentId',
            'student_userId',
            'student_name',
            'student_email',
            'admission_code',
            'class_label',
            'classLabel',
            'subject',
            'score',
            'max_score',
            'cat_score',
            'exam_score',
            'percent',
            'grade',
            'remark',
            'teacher_initials',
            'teacherInitials',
            'extra',
          ]);

          Object.entries(r || {}).forEach(([key, value]) => {
            if (!knownKeys.has(key)) extra[key] = value;
          });
        }

        base.extra = extra;
        return base;
      })
      .filter((r) => r.student_user_id && r.subject);

    if (!normalized.length) {
      return res.status(400).json({
        ok: false,
        message: 'No valid rows to save (student + subject required).',
      });
    }

    const uniqueStudentIds = [...new Set(normalized.map((r) => r.student_user_id))];
    const { rows: existingRows } = await pool.query(
      'SELECT id FROM users WHERE id = ANY($1::int[])',
      [uniqueStudentIds],
    );
    const existingIds = new Set(existingRows.map((r) => Number(r.id)));
    const missingIds = uniqueStudentIds.filter((id) => !existingIds.has(id));

    if (missingIds.length) {
      return res.status(400).json({
        ok: false,
        message: `Some student IDs do not exist in the system: ${missingIds.join(', ')}`,
        missingStudentIds: missingIds,
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const upsertSql = `
        INSERT INTO org_exam_results (
          org_id,
          session_id,
          student_user_id,
          class_label,
          subject,
          score,
          max_score,
          cat_score,
          exam_score,
          grade,
          remark,
          teacher_initials,
          extra
        )
        SELECT
          $1::uuid                          AS org_id,
          $2::uuid                          AS session_id,
          $3::int                           AS student_user_id,
          $4::text                          AS class_label,
          $5::text                          AS subject,
          $6::numeric                       AS score,
          $7::numeric                       AS max_score,
          $8::numeric                       AS cat_score,
          $9::numeric                       AS exam_score,
          COALESCE(b.grade, 'N/A')          AS grade,
          COALESCE(
            NULLIF($10::text, ''),
            b.remark,
            ''
          )                                 AS remark,
          NULLIF($11::text, '')             AS teacher_initials,
          COALESCE($12::jsonb, '{}'::jsonb) AS extra
        FROM (
          SELECT $6::numeric AS score, $7::numeric AS max_score
        ) s
        LEFT JOIN org_exam_grading_bands b
          ON b.org_id = $1::uuid
         AND (
              CASE WHEN $7::numeric > 0
                   THEN ( $6::numeric * 100.0 ) / NULLIF($7::numeric, 0)
                   ELSE 0
              END
         ) BETWEEN b.min_percent AND b.max_percent
        ON CONFLICT (org_id, session_id, student_user_id, subject)
        DO UPDATE SET
          class_label      = EXCLUDED.class_label,
          score            = EXCLUDED.score,
          max_score        = EXCLUDED.max_score,
          cat_score        = EXCLUDED.cat_score,
          exam_score       = EXCLUDED.exam_score,
          grade            = EXCLUDED.grade,
          remark           = EXCLUDED.remark,
          teacher_initials = EXCLUDED.teacher_initials,
          extra            = EXCLUDED.extra,
          updated_at       = NOW()
        ;
      `;

      const updateByIdSql = `
        WITH pct AS (
          SELECT
            CASE
              WHEN $7::numeric > 0
              THEN ($6::numeric * 100.0) / NULLIF($7::numeric, 0)
              ELSE 0
            END AS p
        ),
        band AS (
          SELECT b.grade, b.remark
          FROM org_exam_grading_bands b, pct
          WHERE b.org_id = $1::uuid
            AND pct.p BETWEEN b.min_percent AND b.max_percent
          ORDER BY b.min_percent DESC
          LIMIT 1
        )
        UPDATE org_exam_results r
        SET
          class_label = $4::text,
          subject = $5::text,
          score = $6::numeric,
          max_score = $7::numeric,
          cat_score = $8::numeric,
          exam_score = $9::numeric,
          grade = COALESCE((SELECT grade FROM band), 'N/A'),
          remark = COALESCE(NULLIF($10::text, ''), (SELECT remark FROM band), ''),
          teacher_initials = NULLIF($11::text, ''),
          extra = COALESCE($12::jsonb, '{}'::jsonb),
          updated_at = NOW()
        WHERE r.org_id = $1::uuid
          AND r.session_id = $2::uuid
          AND r.student_user_id = $3::int
          AND r.id = $13
        RETURNING r.id;
      `;

      for (const r of normalized) {
        // ✅ If id exists, update that exact row (supports subject renames)
        if (r.id) {
          const upd = await client.query(updateByIdSql, [
            orgId,
            sessionId,
            r.student_user_id,
            r.class_label,
            r.subject,
            r.score ?? 0,
            r.max_score ?? 100,
            r.cat_score,
            r.exam_score,
            r.remark ?? '',
            r.teacher_initials ?? '',
            r.extra ?? {},
            r.id,
          ]);

          // If update matched, move on
          if (upd.rowCount > 0) continue;
        }

        // Fallback: new row (no id) or missing row
        await client.query(upsertSql, [
          orgId,
          sessionId,
          r.student_user_id,
          r.class_label,
          r.subject,
          r.score ?? 0,
          r.max_score ?? 100,
          r.cat_score,
          r.exam_score,
          r.remark ?? '',
          r.teacher_initials ?? '',
          r.extra ?? {},
        ]);
      }

      // Recompute totals + overall grades
      await client.query(
        `
        INSERT INTO org_exam_student_overall (
          org_id, session_id, student_user_id, class_label,
          total_score, total_max, total_percent, overall_grade,
          created_at, updated_at
        )
        SELECT
          r.org_id,
          r.session_id,
          r.student_user_id,
          MAX(r.class_label)                        AS class_label,
          SUM(r.score)                              AS total_score,
          SUM(r.max_score)                          AS total_max,
          CASE WHEN SUM(r.max_score) > 0
               THEN (SUM(r.score) * 100.0) / SUM(r.max_score)
               ELSE 0
          END                                       AS total_percent,
          COALESCE(
            (
              SELECT b.grade
              FROM org_exam_grading_bands b
              WHERE b.org_id = r.org_id
                AND (
                  CASE WHEN SUM(r.max_score) > 0
                       THEN (SUM(r.score) * 100.0) / SUM(r.max_score)
                       ELSE 0
                  END
                ) BETWEEN b.min_percent AND b.max_percent
              ORDER BY b.min_percent DESC
              LIMIT 1
            ),
            'N/A'
          )                                         AS overall_grade,
          NOW()                                     AS created_at,
          NOW()                                     AS updated_at
        FROM org_exam_results r
        WHERE r.org_id = $1::uuid
          AND r.session_id = $2::uuid
          AND ( $3::text IS NULL OR r.class_label = $3::text )
        GROUP BY r.org_id, r.session_id, r.student_user_id
        ON CONFLICT (org_id, session_id, student_user_id)
        DO UPDATE SET
          class_label   = EXCLUDED.class_label,
          total_score   = EXCLUDED.total_score,
          total_max     = EXCLUDED.total_max,
          total_percent = EXCLUDED.total_percent,
          overall_grade = EXCLUDED.overall_grade,
          updated_at    = NOW()
        ;
        `,
        [orgId, sessionId, classLabel || null],
      );

      await client.query('COMMIT');
      return res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[saveOrgExamSheet] error', err);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[saveOrgExamSheet] outer error', err);
    return res.status(400).json({
      ok: false,
      message: (err && err.message) || 'Failed to save exam sheet',
    });
  }
}


/** POST /api/orgs/:orgId/exams/student/:studentId/notify */
export async function sendOrgExamStudentCardEmail(req, res, next) {
  try {
    const { orgId, studentId } = req.params;
    const { sessionId, toOverride } = req.body || {};

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const studentRes = await pool.query(
      `SELECT u.id, u.name, u.email, up.guardian_email
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = $1`,
      [studentId],
    );
    if (studentRes.rowCount === 0) {
      return res.status(404).json({ ok: false, message: 'Student not found' });
    }
    const student = studentRes.rows[0];

    const rowsRes = await pool.query(
      `SELECT subject, score, max_score, percent, grade
       FROM org_exam_results
       WHERE org_id = $1
         AND session_id = $2
         AND student_user_id = $3
       ORDER BY subject ASC`,
      [orgId, sessionId, studentId],
    );
    const rows = rowsRes.rows;

    const totalScore = rows.reduce((sum, r) => sum + Number(r.score ?? 0), 0);
    const totalMax = rows.reduce((sum, r) => sum + Number(r.max_score ?? 0), 0);
    const totalPercent = totalMax > 0 ? (totalScore * 100.0) / totalMax : 0;
    const { grade: overallGrade } = await pickGrade(orgId, totalPercent);

    const targetEmail = toOverride || student.guardian_email || student.email;

    if (!targetEmail) {
      return res.status(400).json({
        ok: false,
        message:
          'No guardian email or student email available for this learner.',
      });
    }

    // TODO: plug into your mailer service with the new rich card if you want
    // const card = await getStudentExamCard({ orgId, sessionId, studentUserId: Number(studentId) });

    console.log('[sendExamCard] would email', {
      to: targetEmail,
      studentName: student.name,
      totalPercent,
      overallGrade,
    });

    return res.json({ ok: true, to: targetEmail });
  } catch (err) {
    next(err);
  }
}

/** GET /api/orgs/:orgId/exams/analytics?sessionId=... */
export async function getOrgExamAnalytics(req, res, next) {
  try {
    const { orgId } = req.params;
    const { sessionId } = req.query;

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const { rows } = await pool.query(
      `
        SELECT
          subject,
          COUNT(*)                   AS scripts,
          AVG(percent)::numeric(5,2) AS avg_percent,
          MIN(percent)::numeric(5,2) AS min_percent,
          MAX(percent)::numeric(5,2) AS max_percent
        FROM org_exam_results
        WHERE org_id = $1
          AND session_id = $2
        GROUP BY subject
        ORDER BY subject ASC
      `,
      [orgId, sessionId],
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function generateOrgExamStudentAiRemarks(req, res, next) {
  try {
    const { orgId, studentId } = req.params;
    const { sessionId, instructions } = req.body || {};

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const card = await getStudentExamCard({
      orgId,
      sessionId,
      studentUserId: Number(studentId),
    });

    if (!card) {
      return res
        .status(404)
        .json({ ok: false, message: 'Report card not found' });
    }

    // Inject current grading-band overall grade before sending to AI
    if (card.summary && typeof card.summary.totalPercent === 'number') {
      const { grade, remark } = await pickGrade(
        orgId,
        card.summary.totalPercent,
      );
      card.summary.overallGrade = card.summary.overallGrade || grade;
      card.summary.overallRemark = card.summary.overallRemark || remark || null;
    }

    const { principalRemark, subjectRemarks } = await aiGenerateExamInsights({
      card,
      instructions,
    });

    // OPTIONAL: if you later add a principal_remark column to org_exam_student_overall,
    // you can persist principalRemark here.
    //
    // For now, we just return JSON and let the frontend wire principalRemark +
    // per-subject remarks into existing UI + saveOrgExamSheet.

    return res.json({
      ok: true,
      principalRemark,
      subjectRemarks,
    });
  } catch (err) {
    console.error('[generateOrgExamStudentAiRemarks] error', err);
    return next(err);
  }
}

/** POST /api/orgs/:orgId/exams/student/:studentId/remarks */
export async function saveOrgExamStudentRemarks(req, res, next) {
  try {
    const { orgId, studentId } = req.params;
    const { sessionId, principalRemark } = req.body || {};

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    const trimmed = (principalRemark ?? '').toString().trim() || null;

    await pool.query(
      `
        INSERT INTO org_exam_student_overall (
          org_id,
          session_id,
          student_user_id,
          class_label,
          total_score,
          total_max,
          total_percent,
          overall_grade,
          principal_remark,
          created_at,
          updated_at
        )
        VALUES (
          $1::uuid,
          $2::uuid,
          $3::int,
          NULL,
          0,
          0,
          0,
          'N/A',
          $4::text,
          NOW(),
          NOW()
        )
        ON CONFLICT (org_id, session_id, student_user_id)
        DO UPDATE SET
          principal_remark = $4::text,
          updated_at       = NOW()
      `,
      [orgId, sessionId, studentId, trimmed],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[saveOrgExamStudentRemarks] error', err);
    return next(err);
  }
}

/** GET /api/orgs/:orgId/exams/sessions/:sessionId/class-report.pdf?classLabel=...&format=booklet */
export async function getOrgClassReportPdf(req, res, next) {
  try {
    const { orgId, sessionId } = req.params;
    const { classLabel, format = 'booklet' } = req.query;

    if (!sessionId) {
      return res.status(400).json({ message: 'sessionId is required' });
    }
    if (!classLabel) {
      return res.status(400).json({ message: 'classLabel is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    // ── Load org (for logo + name + contact like report card) ──
    const { rows: orgRows } = await pool.query(
      'SELECT * FROM organizations WHERE id = $1',
      [orgId],
    );
    if (!orgRows.length) {
      return res.status(404).json({ message: 'Organization not found' });
    }
    const org = orgRows[0];

    // ── Load session + term ──
    const { rows: sessionRows } = await pool.query(
      `
      SELECT
        s.id,
        s.label AS exam_label,
        t.label AS term_label,
        t.year  AS term_year
      FROM org_exam_sessions s
      LEFT JOIN org_exam_terms t
        ON t.id = s.term_id
      WHERE s.id = $1
        AND s.org_id = $2
      `,
      [sessionId, orgId],
    );
    if (!sessionRows.length) {
      return res.status(404).json({ message: 'Exam session not found' });
    }
    const session = sessionRows[0];

    // Try to find any per-class teacher signature for this class
    const { rows: classSigRows } = await pool.query(
      `
  SELECT class_teacher_signature_url
  FROM org_learner_profiles
  WHERE org_id = $1
    AND class_label = $2
    AND class_teacher_signature_url IS NOT NULL
  LIMIT 1
  `,
      [orgId, classLabel],
    );

    const classTeacherSignatureUrl =
      classSigRows[0]?.class_teacher_signature_url || null;

    const examMeta = {
      classLabel: String(classLabel || '').trim(),
      termLabel: session.term_label || '',
      termYear: session.term_year || '',
      examLabel: session.exam_label || '',
      // 👇 NEW: per-class teacher signature for this report
      class_teacher_signature_url: classTeacherSignatureUrl,
    };

    // ── Subject summary for this class ──
    const { rows: subjectStats } = await pool.query(
      `
      SELECT
        subject,
        COUNT(*)                                AS scripts,
        ROUND(AVG(percent)::numeric, 1)         AS avg_percent,
        ROUND(MIN(percent)::numeric, 1)         AS min_percent,
        ROUND(MAX(percent)::numeric, 1)         AS max_percent
      FROM org_exam_results
      WHERE org_id = $1
        AND session_id = $2
        AND class_label = $3
      GROUP BY subject
      ORDER BY subject ASC
      `,
      [orgId, sessionId, classLabel],
    );

    // ── Per-learner totals from org_exam_student_overall ──
    // ── Per-learner totals from org_exam_student_overall ──
    const { rows: overallRows } = await pool.query(
      `
  SELECT
    o.student_user_id,
    o.class_label,
    o.total_score,
    o.total_max,
    o.total_percent,
    o.overall_grade,
    COALESCE(u.name, u.email) AS student_name
  FROM org_exam_student_overall o
  LEFT JOIN users u
    ON u.id = o.student_user_id
  WHERE o.org_id = $1
    AND o.session_id = $2
    AND o.class_label = $3
  `,
      [orgId, sessionId, classLabel],
    );

    const studentRows = overallRows.map((row) => ({
      admission_code: null, // you can wire this later if you add a table/column
      student_name: row.student_name,
      total_score: row.total_score,
      total_max: row.total_max,
      total_percent: row.total_percent,
      overall_grade: row.overall_grade,
      // position is assigned in the PDF renderer
    }));

    if (!studentRows.length) {
      return res.status(400).json({
        message:
          'No learner totals found for this class. Ensure marks are saved before downloading the class report.',
      });
    }

    // ── Render PDF (buffer, like the student card) ──
    const pdfBuffer = await renderOrgExamClassReportPdf({
      org,
      examMeta,
      subjectStats,
      studentRows,
      format,
    });

    const safeClassLabel =
      String(classLabel || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'class';

    const safeExamLabel =
      String(examMeta.examLabel || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'exam';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${safeClassLabel}-${safeExamLabel}-class-report.pdf"`,
    );

    return res.send(pdfBuffer);
  } catch (err) {
    console.error('[getOrgClassReportPdf] error', err);
    return next(err);
  }
}

/** POST /api/orgs/:orgId/exams/sheet/ai-compute
 *
 * Body:
 * {
 *   sessionId: string,
 *   classLabel?: string,
 *   rows?: OrgExamResultRow[],        // optional; if missing, we fetch from DB
 *   instructions?: string,            // natural language command
 *   targetColumnKey?: string          // e.g. "Effort", "Homework %"
 * }
 *
 * Returns:
 * { ok: true, rows: OrgExamResultRow[] }  // same shape as marks sheet
 */
export async function generateOrgExamSheetAiCompute(req, res, next) {
  try {
    const { orgId } = req.params;
    const {
      sessionId,
      classLabel,
      rows: rowsFromClient,
      instructions,
      targetColumnKey,
    } = req.body || {};

    if (!sessionId) {
      return res
        .status(400)
        .json({ ok: false, message: 'sessionId is required' });
    }

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    let baseRows = Array.isArray(rowsFromClient) ? rowsFromClient : null;

    // If frontend didn't send rows, fall back to DB (same query as getOrgExamSheet)
    if (!baseRows || !baseRows.length) {
      const { rows } = await pool.query(
        `SELECT
           r.id,
           r.student_user_id,
           u.name AS student_name,
           u.email AS student_email,
           r.class_label,
           r.subject,
           r.score,
           r.max_score,
           r.cat_score,
           r.exam_score,
           r.percent,
           r.grade,
           r.remark,
           r.teacher_initials,
           r.extra
         FROM org_exam_results r
         JOIN users u ON u.id = r.student_user_id
         WHERE r.org_id = $1
           AND r.session_id = $2
           AND ($3::text IS NULL OR r.class_label = $3)
         ORDER BY student_name ASC, subject ASC`,
        [orgId, sessionId, classLabel || null],
      );
      baseRows = rows;
    }

    const meta = {
      orgName: (req.org && req.org.name) || null,
      classLabel: classLabel || null,
      sessionId,
      targetColumnKey: targetColumnKey || null,
    };

    const { updatedRows } = await aiComputeExamSheet({
      rows: baseRows,
      instructions,
      meta,
      targetColumnKey,
    });

    // Index AI patches by (student_user_id, subject)
    const updatesByKey = new Map();
    for (const patch of updatedRows) {
      if (!patch) continue;
      const sid = Number(patch.student_user_id);
      const subject =
        patch.subject && patch.subject.toString().trim().toLowerCase();
      if (!sid || !subject) continue;
      const key = `${sid}::${subject}`;
      updatesByKey.set(key, patch);
    }

    const mergedRows = baseRows.map((row) => {
      const sid = Number(row.student_user_id);
      const subject = (row.subject || '').toString().trim().toLowerCase();
      const key = `${sid}::${subject}`;
      const patch = updatesByKey.get(key);

      if (!patch) return row;

      const next = { ...row };
      // ✅ Allow AI to rename/fix subject spelling
      if (patch.subject_new !== undefined) {
        const sn = patch.subject_new == null ? '' : String(patch.subject_new).trim();
        if (sn) next.subject = sn;
      }


      // Top-level numeric + text fields (only if specified by AI)
      if (patch.score !== undefined) next.score = patch.score;
      if (patch.max_score !== undefined) next.max_score = patch.max_score;
      if (patch.cat_score !== undefined) next.cat_score = patch.cat_score;
      if (patch.exam_score !== undefined) next.exam_score = patch.exam_score;
      if (patch.percent !== undefined) next.percent = patch.percent;
      if (patch.grade !== undefined) next.grade = patch.grade;

      // ✅ Allow AI to update per-subject remark, clamp to max 30 characters
      if (patch.remark !== undefined) {
        next.remark =
          patch.remark == null ? null : clampSubjectRemark(patch.remark, 30);
      }

      // ✅ Allow AI to update teacher_initials
      if (patch.teacher_initials !== undefined) {
        const raw = patch.teacher_initials;
        next.teacher_initials = raw == null ? null : String(raw).trim();
      }

      // extra: merge current + AI extras, with deletion semantics
      const currentExtra =
        next.extra &&
        typeof next.extra === 'object' &&
        !Array.isArray(next.extra)
          ? next.extra
          : {};

      let mergedExtra = { ...currentExtra };

      if (patch.extra && typeof patch.extra === 'object') {
        const patchExtra = patch.extra;
        const tKey = targetColumnKey?.toLowerCase() || null;

        // Special case: when we are computing Remarks, we do NOT want an extra column
        const isRemarksTarget = tKey === 'remark' || tKey === 'remarks';

        if (targetColumnKey && !isRemarksTarget) {
          // Normal target-column behavior
          if (
            Object.prototype.hasOwnProperty.call(patchExtra, targetColumnKey)
          ) {
            const v = patchExtra[targetColumnKey];
            if (v === null || v === '__DELETE__') {
              delete mergedExtra[targetColumnKey];
            } else {
              mergedExtra[targetColumnKey] = v;
            }
          }
        } else if (!targetColumnKey) {
          // Free-form mode: merge all extras, but strip any accidental "Remark(s)" keys
          Object.entries(patchExtra).forEach(([k, v]) => {
            const lowerK = k.toLowerCase();
            if (lowerK === 'remark' || lowerK === 'remarks') {
              // ignore – we want the canonical remark column instead
              return;
            }
            if (v === null || v === '__DELETE__') {
              delete mergedExtra[k];
            } else {
              mergedExtra[k] = v;
            }
          });
        }
        // If isRemarksTarget, we simply ignore extra.Remark(s); the main remark field
        // is already handled above via `patch.remark` -> `next.remark`.
      }

      // Ensure we always have a plain object, never an array
      next.extra =
        mergedExtra &&
        typeof mergedExtra === 'object' &&
        !Array.isArray(mergedExtra)
          ? mergedExtra
          : {};

      return next;
    });

    return res.json({ ok: true, rows: mergedRows });
  } catch (err) {
    console.error('[generateOrgExamSheetAiCompute] error', err);
    return next(err);
  }
}

export const generateOrgExamSheetFromDocs = [
  upload.array('files', 3), // up to 3 documents
  async (req, res, next) => {
    try {
      const { orgId } = req.params;
      const {
        sessionId,
        classLabel,
        instructions,
        rows: rowsJson,
      } = req.body || {};

      if (!sessionId) {
        return res
          .status(400)
          .json({ ok: false, message: 'sessionId is required' });
      }

      await requireOrgTier(orgId, ['pro', 'enterprise']);

      // ── Base rows (same behaviour as ai-compute) ────────────────────────────
      let baseRows = [];
      try {
        baseRows = rowsJson ? JSON.parse(rowsJson) : [];
      } catch {
        baseRows = [];
      }

      if (!Array.isArray(baseRows) || !baseRows.length) {
        const { rows } = await pool.query(
          `SELECT
             r.id,
             r.student_user_id,
             u.name AS student_name,
             u.email AS student_email,
             r.class_label,
             r.subject,
             r.score,
             r.max_score,
             r.cat_score,
             r.exam_score,
             r.percent,
             r.grade,
             r.remark,
             r.teacher_initials,
             r.extra
           FROM org_exam_results r
           JOIN users u ON u.id = r.student_user_id
           WHERE r.org_id = $1
             AND r.session_id = $2
             AND ($3::text IS NULL OR r.class_label = $3)
           ORDER BY student_name ASC, subject ASC`,
          [orgId, sessionId, classLabel || null],
        );
        baseRows = rows;
      }

      // ── Upload attachments to Cloudinary (like profileController) ──────────
      const files = req.files || [];
      let attachments = [];

      if (files.length) {
        const uploads = await uploadExamDocsToCloudinary(files);

        attachments = uploads.map((upload, idx) => {
          const f = files[idx];
          const textPreview =
            f.mimetype.startsWith('text/') || f.mimetype === 'text/csv'
              ? Buffer.from(f.buffer).toString('utf8').slice(0, 8000)
              : null;

          return {
            filename: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            url: upload.url,
            public_id: upload.public_id,
            textPreview,
          };
        });
      }

      const meta = {
        orgName: (req.org && req.org.name) || null,
        classLabel: classLabel || null,
        sessionId,
        attachments, // ⬅️ now includes Cloudinary URLs + previews
      };

      // 🔮 Call the same core helper, but with document context in meta
      const { updatedRows } = await aiComputeExamSheet({
        rows: baseRows,
        instructions:
          instructions ||
          'Use the attached documents to fill or update this exam sheet where possible.',
        meta,
        targetColumnKey: null,
      });

      // ── Merge AI patches back into the base rows (same semantics as ai-compute)
      const updatesByKey = new Map();
      for (const patch of updatedRows) {
        if (!patch) continue;
        const sid = Number(patch.student_user_id);
        const subject =
          patch.subject && patch.subject.toString().trim().toLowerCase();
        if (!sid || !subject) continue;
        const key = `${sid}::${subject}`;
        updatesByKey.set(key, patch);
      }

      const mergedRows = baseRows.map((row) => {
        const sid = Number(row.student_user_id);
        const subject = (row.subject || '').toString().trim().toLowerCase();
        const key = `${sid}::${subject}`;
        const patch = updatesByKey.get(key);

        if (!patch) return row;

        const next = { ...row };
        // ✅ Allow AI to rename/fix subject spelling
        if (patch.subject_new !== undefined) {
          const sn = patch.subject_new == null ? '' : String(patch.subject_new).trim();
          if (sn) next.subject = sn;
        }


        // top-level fields
        if (patch.score !== undefined) next.score = patch.score;
        if (patch.max_score !== undefined) next.max_score = patch.max_score;
        if (patch.cat_score !== undefined) next.cat_score = patch.cat_score;
        if (patch.exam_score !== undefined) next.exam_score = patch.exam_score;
        if (patch.percent !== undefined) next.percent = patch.percent;
        if (patch.grade !== undefined) next.grade = patch.grade;

        /// ✅ Allow AI to update per-subject remark, clamp to max 30 characters
        if (patch.remark !== undefined) {
          next.remark =
            patch.remark == null ? null : clampSubjectRemark(patch.remark, 30);
        }

        // ✅ Allow AI to update teacher_initials
        if (patch.teacher_initials !== undefined) {
          const raw = patch.teacher_initials;
          next.teacher_initials = raw == null ? null : String(raw).trim();
        }

        // extra: free-form merge with deletion semantics
        const currentExtra =
          next.extra &&
          typeof next.extra === 'object' &&
          !Array.isArray(next.extra)
            ? next.extra
            : {};

        let mergedExtra = { ...currentExtra };

        if (patch.extra && typeof patch.extra === 'object') {
          Object.entries(patch.extra).forEach(([k, v]) => {
            if (v === null || v === '__DELETE__') {
              delete mergedExtra[k];
            } else {
              mergedExtra[k] = v;
            }
          });
        }

        next.extra =
          mergedExtra &&
          typeof mergedExtra === 'object' &&
          !Array.isArray(mergedExtra)
            ? mergedExtra
            : {};

        return next;
      });

      return res.json({ ok: true, rows: mergedRows });
    } catch (err) {
      console.error('[generateOrgExamSheetFromDocs] error', err);
      return next(err);
    }
  },
];

export async function generateOrgExamConfigAi(req, res, next) {
  try {
    const { orgId } = req.params;
    const { config: configFromClient, instructions } = req.body || {};

    await requireOrgTier(orgId, ['pro', 'enterprise']);

    // Base config from client if provided, otherwise load from DB + org title
    let baseConfig = configFromClient;
    if (!baseConfig) {
      const [orgRes, terms, sessions, bands] = await Promise.all([
        pool.query(
          `SELECT exam_report_title
           FROM organizations
           WHERE id = $1`,
          [orgId],
        ),
        pool.query(
          `SELECT id, label, year, is_active
           FROM org_exam_terms
           WHERE org_id = $1
           ORDER BY year DESC, created_at DESC`,
          [orgId],
        ),
        pool.query(
          `SELECT id, label, term_id, weight, starts_at, ends_at
           FROM org_exam_sessions
           WHERE org_id = $1
           ORDER BY created_at DESC`,
          [orgId],
        ),
        pool.query(
          `SELECT id, scheme_name, grade, min_percent, max_percent, remark, sort_order
           FROM org_exam_grading_bands
           WHERE org_id = $1
           ORDER BY scheme_name, sort_order ASC, min_percent DESC`,
          [orgId],
        ),
      ]);

      baseConfig = {
        reportTitle: orgRes.rows[0]?.exam_report_title ?? null,
        terms: terms.rows,
        sessions: sessions.rows,
        gradingBands: bands.rows,
      };
    }

    const {
      terms,
      sessions,
      gradingBands,
      reportTitle, // 👈 may be new/edited by AI
    } = await aiTransformExamConfig({
      config: baseConfig,
      instructions,
    });

    // Use AI title if provided, otherwise fall back to base
    const nextReportTitle = reportTitle ?? baseConfig.reportTitle ?? null;

    // ─────────────────────────────────────────────
    // Normalise + generate temporary IDs for front-end editing
    // ─────────────────────────────────────────────
    const nowKey = Date.now().toString(36);

    const termIdByLabel = new Map();
    const safeTerms = (terms || []).map((t, idx) => {
      const id = `tmp-term-${nowKey}-${idx}`;
      const label = String(t.label || `Term ${idx + 1}`).trim();
      const yearRaw =
        t.year != null ? Number(t.year) : new Date().getFullYear();
      const year = Number.isFinite(yearRaw)
        ? yearRaw
        : new Date().getFullYear();

      const term = {
        id,
        label,
        year,
        is_active: t.is_active !== false,
      };

      termIdByLabel.set(label.toLowerCase(), id);
      return term;
    });

    const safeSessions = (sessions || []).map((s, idx) => {
      const id = `tmp-session-${nowKey}-${idx}`;
      const label = String(s.label || `Exam ${idx + 1}`).trim();
      const termLabel = String(s.term_label || '')
        .trim()
        .toLowerCase();
      const term_id = termLabel ? termIdByLabel.get(termLabel) || null : null;
      const weightRaw = s.weight != null ? Number(s.weight) : 1;
      const weight = Number.isFinite(weightRaw) ? weightRaw : 1;

      return {
        id,
        term_id,
        label,
        weight,
        starts_at: s.starts_at || null,
        ends_at: s.ends_at || null,
      };
    });

    const safeBands = (gradingBands || []).map((b, idx) => {
      const minRaw = b.min_percent != null ? Number(b.min_percent) : 0;
      const maxRaw = b.max_percent != null ? Number(b.max_percent) : 0;

      return {
        id: `tmp-band-${nowKey}-${idx}`,
        scheme_name: b.scheme_name || 'default',
        grade: String(b.grade || '').trim(),
        min_percent: Number.isFinite(minRaw) ? minRaw : 0,
        max_percent: Number.isFinite(maxRaw) ? maxRaw : 0,
        remark: b.remark ?? null,
        sort_order: idx,
      };
    });

    return res.json({
      ok: true,
      config: {
        reportTitle: nextReportTitle, // 👈 NEW in payload
        terms: safeTerms,
        sessions: safeSessions,
        gradingBands: safeBands,
      },
    });
  } catch (err) {
    console.error('[generateOrgExamConfigAi] error', err);
    return next(err);
  }
}
