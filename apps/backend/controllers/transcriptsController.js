// apps/backend/controllers/transcriptsController.js
import Joi from 'joi';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import axios from 'axios';
import pool from '../config/db.js';
import { generateTranscriptPdfBuffer } from '../services/transcriptService.js';
import { isUuid, getEntitlement, upsertEntitlement } from './_entitlements.js';

// NOTE: Do NOT default `sections` here; otherwise an empty array would mask server stats.
const genSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
  overallPct: Joi.number().min(0).max(100).optional(),
  passMark: Joi.number().min(0).max(100).optional(),

  lessonsLearnt: Joi.array()
    .items(
      Joi.alternatives().try(
        Joi.string().trim(),
        Joi.object({
          title: Joi.string().allow(''),
          label: Joi.string().allow(''),
        }),
      ),
    )
    .optional(),

  sections: Joi.array()
    .items(
      Joi.object({
        sectionTitle: Joi.string().allow('').optional(),
        items: Joi.array()
          .items(
            Joi.object({
              label: Joi.string().allow('').required(),
              scorePct: Joi.number().min(0).max(100).required(),
            }),
          )
          .default([]),
      }),
    )
    .optional(),

  force: Joi.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function logErr(tag, err, extra = {}) {
  const x = (err && err.response && err.response.headers) || {};
  const xCld = x['x-cld-error'] || x['X-Cld-Error'];
  console.error(tag, {
    message: err?.message,
    status: err?.status || err?.response?.status,
    x_cld_error: xCld,
    stack: err?.stack,
    ...extra,
  });
}

async function hasOrgCoverForCourse(userId, courseId) {
  const q = await pool.query(
    `
      SELECT 1
        FROM org_quiz_attempts q
        JOIN org_course_assignments a ON a.id = q.assignment_id
       WHERE q.user_id     = $1
         AND a.course_id   = $2
         AND q.submitted_at IS NOT NULL
         AND q.passed      = TRUE
       LIMIT 1
    `,
    [userId, courseId],
  );
  return q.rowCount > 0;
}

/** NEW: Best-effort fetch of lesson titles the learner actually attempted */
async function loadAttemptedLessonTitles(db, userId, courseId) {
  const uidText = String(userId);
  const uidNum = Number(uidText);
  const out = new Set();

  // Try PERSONAL lesson attempts (uuid)
  const sqlPersonal = `
    SELECT DISTINCT ON (l.id) l.title
      FROM lesson_attempts la
      JOIN lessons l ON l.id = la.lesson_id
     WHERE la.user_id = $1::uuid
       AND l.course_id = $2::uuid
     ORDER BY l.id, la.started_at DESC NULLS LAST
  `;
  // Try PERSONAL lesson attempts (numeric student_id)
  const sqlPersonalStudent = `
    SELECT DISTINCT ON (l.id) l.title
      FROM lesson_attempts la
      JOIN lessons l ON l.id = la.lesson_id
     WHERE la.student_id = $1::bigint
       AND l.course_id = $2::uuid
     ORDER BY l.id, la.started_at DESC NULLS LAST
  `;
  // Try ORG lesson attempts (uuid)
  const sqlOrg = `
    SELECT DISTINCT ON (l.id) l.title
      FROM org_lesson_attempts la
      JOIN lessons l ON l.id = la.lesson_id
      JOIN org_course_assignments a ON a.id = la.assignment_id
     WHERE la.user_id = $1::uuid
       AND a.course_id = $2::uuid
     ORDER BY l.id, la.started_at DESC NULLS LAST
  `;

  const eat = async (q, params) => {
    try {
      const r = await db.query(q, params);
      for (const row of r.rows || []) {
        const t = (row.title || '').trim();
        if (t) out.add(t);
      }
    } catch (e) {
      // Table/column not found in this deployment → ignore silently
      if (!['42P01', '42703', '22P02'].includes(String(e?.code))) throw e;
    }
  };

  // Personal (uuid)
  if (/^[0-9a-f-]{36}$/i.test(uidText)) {
    await eat(sqlPersonal, [uidText, courseId]).catch(() => {});
  } else if (Number.isFinite(uidNum)) {
    await eat(sqlPersonalStudent, [uidNum, courseId]).catch(() => {});
  }

  // Org (uuid only)
  if (/^[0-9a-f-]{36}$/i.test(uidText)) {
    await eat(sqlOrg, [uidText, courseId]).catch(() => {});
  }

  // Fallback: if nothing, use quiz titles from latest attempts (acts as units in many setups)
  if (!out.size) {
    try {
      const r = await db.query(
        `
        SELECT title FROM (
          SELECT q.title, row_number() OVER (PARTITION BY qa.quiz_id ORDER BY qa.submitted_at DESC) AS rn
            FROM quiz_attempts qa
            JOIN quizzes q ON q.id = qa.quiz_id
           WHERE (qa.user_id = $1::uuid OR qa.student_id::text = $1)
             AND qa.course_id = $2::uuid
             AND qa.submitted_at IS NOT NULL
        ) t WHERE rn = 1
        `,
        [uidText, courseId],
      );
      for (const row of r.rows || []) {
        const t = (row.title || '').trim();
        if (t) out.add(t);
      }
    } catch {
      // Ignore
    }
  }

  return Array.from(out);
}

// Compute overallPct, passMark, and a breakdown from latest attempts (+ lessons section).
async function loadTranscriptScores(db, userId, courseId) {
  const uidText = String(userId);
  const uidNum = Number(uidText);

  // --- PERSONAL ATTEMPTS (latest per quiz) ---
  const personalUserSql = `
    SELECT quiz_id, score_pct, pass_mark, title
    FROM (
      SELECT qa.quiz_id,
             qa.score_pct::float AS score_pct,
             qa.pass_mark::float AS pass_mark,
             q.title,
             row_number() OVER (PARTITION BY qa.quiz_id ORDER BY qa.submitted_at DESC) AS rn
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.user_id = $1::uuid
        AND qa.course_id = $2::uuid
        AND qa.submitted_at IS NOT NULL
    ) t
    WHERE rn = 1
  `;
  const personalStudentSql = `
    SELECT quiz_id, score_pct, pass_mark, title
    FROM (
      SELECT qa.quiz_id,
             qa.score_pct::float AS score_pct,
             qa.pass_mark::float AS pass_mark,
             q.title,
             row_number() OVER (PARTITION BY qa.quiz_id ORDER BY qa.submitted_at DESC) AS rn
      FROM quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      WHERE qa.student_id = $1::bigint
        AND qa.course_id  = $2::uuid
        AND qa.submitted_at IS NOT NULL
    ) t
    WHERE rn = 1
  `;

  let personal = { rows: [] };
  try {
    if (/^[0-9a-f-]{36}$/i.test(uidText)) {
      personal = await db.query(personalUserSql, [uidText, courseId]);
    } else {
      throw Object.assign(new Error('not uuid'), { code: '22P02' });
    }
  } catch (e) {
    if (e?.code === '42703' || e?.code === '22P02') {
      if (Number.isFinite(uidNum)) {
        personal = await db
          .query(personalStudentSql, [uidNum, courseId])
          .catch(() => ({ rows: [] }));
      }
    } else {
      throw e;
    }
  }

  // --- ORG ATTEMPTS (latest per quiz) ---
  const orgSql = `
    SELECT quiz_id, score_pct, pass_mark, title
    FROM (
      SELECT qa.quiz_id,
             qa.score_pct::float AS score_pct,
             qa.pass_mark::float AS pass_mark,
             q.title,
             row_number() OVER (PARTITION BY qa.quiz_id ORDER BY qa.submitted_at DESC) AS rn
      FROM org_quiz_attempts qa
      JOIN quizzes q ON q.id = qa.quiz_id
      JOIN org_course_assignments a ON a.id = qa.assignment_id
      WHERE qa.user_id = $1::uuid
        AND a.course_id = $2::uuid
        AND qa.submitted_at IS NOT NULL
    ) t
    WHERE rn = 1
  `;
  let org = { rows: [] };
  if (/^[0-9a-f-]{36}$/i.test(uidText)) {
    org = await db
      .query(orgSql, [uidText, courseId])
      .catch(() => ({ rows: [] }));
  }

  const rows = personal.rows.length ? personal.rows : org.rows;
  // Normalize 0–1 to 0–100
  const toPct = (x) => {
    const n = Number(x) || 0;
    return n > 0 && n <= 1 ? n * 100 : n;
  };

  if (!rows.length) {
    // Even if no quizzes, still try to add "Lessons Attempted"
    const lessons = await loadAttemptedLessonTitles(db, userId, courseId);
    const sections = [];
    if (lessons.length) {
      sections.push({
        sectionTitle: 'Lessons Attempted',
        items: lessons.map((title) => ({ label: title, scorePct: 100 })),
      });
    }
    return { overallPct: 0, passMark: 70, sections };
  }

  const normalized = rows.map((r) => ({
    title: r.title,
    quiz_id: r.quiz_id,
    score_pct: toPct(r.score_pct),
    pass_mark: toPct(r.pass_mark),
  }));

  const sum = normalized.reduce((s, r) => s + r.score_pct, 0);
  const overallPct = Math.round((sum / normalized.length) * 100) / 100;
  const passMark = Math.max(...normalized.map((r) => r.pass_mark)) || 70;

  const sections = [
    {
      sectionTitle: 'Quiz Scores',
      items: normalized.map((r) => ({
        label: r.title || `Quiz ${r.quiz_id}`,
        scorePct: Math.round(r.score_pct * 100) / 100,
      })),
    },
  ];

  // NEW: Always append Lessons Attempted if any
  const lessons = await loadAttemptedLessonTitles(db, userId, courseId);
  if (lessons.length) {
    sections.push({
      sectionTitle: 'Lessons Attempted',
      items: lessons.map((title) => ({ label: title, scorePct: 100 })), // 100% = attempted
    });
  }

  return { overallPct, passMark, sections };
}

// Recognize Extended purchase even if entitlement row hasn't been written yet.
async function hasExtendedByIssuance(userId, courseId) {
  const q = await pool.query(
    `
      SELECT 1
        FROM ai_certificate_issuances i
        JOIN ai_certificates c ON c.id = i.certificate_id
       WHERE i.user_id = $1
         AND (i.course_id IS NULL OR i.course_id = $2)
         AND (
              c.tier = 'extended'
           OR c.title ILIKE '%extended%'
           OR c.title ILIKE '%transcript%'
           OR c.code  ~* '(^|\\W)(ext|extended|xtra|plus)(\\W|$)'
         )
       LIMIT 1
    `,
    [userId, courseId],
  );
  return q.rowCount > 0;
}

// Extract Cloudinary public_id from a URL like .../transcripts/<id>.pdf
function publicIdFromTranscriptUrl(u) {
  try {
    if (!u) return null;
    const url = new URL(u);
    const parts = url.pathname.split('/');
    const idx = parts.findIndex((p) => p === 'transcripts');
    if (idx >= 0 && parts[idx + 1]) {
      return `transcripts/${parts[idx + 1].replace(/\.pdf$/i, '')}`;
    }
  } catch {}
  return null;
}

// Ensure “Lessons Attempted” section is present (append or replace)
function ensureLessonsSection(existingSections, lessonTitles) {
  const sections = Array.isArray(existingSections) ? [...existingSections] : [];
  const idx = sections.findIndex((s) =>
    String(s?.sectionTitle || '')
      .toLowerCase()
      .includes('lesson'),
  );
  const items = Array.from(
    new Set((lessonTitles || []).map((t) => (t || '').trim()).filter(Boolean)),
  ).map((label) => ({ label, scorePct: 100 }));

  if (!items.length) return sections;

  const newSec = { sectionTitle: 'Lessons Attempted', items };
  if (idx >= 0) sections[idx] = newSec;
  else sections.push(newSec);
  return sections;
}

// ─────────────────────────────────────────────────────────────
// Controllers
// ─────────────────────────────────────────────────────────────

/**
 * POST /api/transcripts/generate
 * Body: { courseId, [overallPct, passMark, sections, force] }
 * Gate: transcript available with org coverage OR Extended certificate.
 * Return: { id, student_id, course_id, url, download_url }
 */
export async function generateTranscript(req, res) {
  const t0 = Date.now();
  try {
    const { error, value } = genSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const userId = req.user?.id;
    const { courseId } = value;

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });
    if (!isUuid(courseId))
      return res.status(400).json({ error: 'Invalid courseId' });

    // Define once and reuse everywhere (avoid “Cannot redeclare 'base'”)
    const base = (
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    ).replace(/\/+$/, '');

    // Only treat client fields as overrides if actually provided in the payload.
    const provided = (k) => Object.prototype.hasOwnProperty.call(value, k);
    const clientOverallPct = provided('overallPct')
      ? value.overallPct
      : undefined;
    const clientPassMark = provided('passMark') ? value.passMark : undefined;
    const clientSections = provided('sections') ? value.sections : undefined;
    const force = value.force === true;

    // 1) Eligibility
    const [orgCovered, ent] = await Promise.all([
      hasOrgCoverForCourse(userId, courseId).catch(() => false),
      getEntitlement(pool, userId, courseId).catch(() => null),
    ]);
    let canTranscript = Boolean(orgCovered || ent?.can_transcript === true);

    // 2) Extended via issuance (auto-heal)
    if (!canTranscript) {
      const viaIssuance = await hasExtendedByIssuance(userId, courseId);
      if (viaIssuance) {
        canTranscript = true;
        try {
          await upsertEntitlement(pool, { userId, courseId, extended: true });
        } catch (e) {
          console.warn(
            '[transcripts] upsertEntitlement (auto-heal) failed:',
            e?.message,
          );
        }
      }
    }

    if (!canTranscript) {
      return res.status(402).json({
        error: 'EXTENDED_REQUIRED',
        message:
          'Transcripts are included with the Extended certificate (or org coverage).',
      });
    }

    // 3) Existing transcript logic (idempotent unless overrides/force)
    const existingQ = await pool.query(
      `SELECT * FROM transcripts WHERE student_id = $1 AND course_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [userId, courseId],
    );

    const hasOverrides =
      clientOverallPct !== undefined ||
      clientPassMark !== undefined ||
      Array.isArray(clientSections);

    if (existingQ.rowCount && !hasOverrides && !force) {
      const row = existingQ.rows[0];
      const download_url = `${base}/api/transcripts/${row.id}/download`;
      console.log('[transcripts] reuse existing (no overrides/no force)', {
        id: row.id,
      });
      return res.json({ ...row, download_url });
    }

    // 4) Minimal info for the PDF
    const u = await pool.query(`SELECT name FROM users WHERE id = $1`, [
      userId,
    ]);
    const c = await pool.query(`SELECT title FROM courses WHERE id = $1`, [
      courseId,
    ]);
    const studentName = u.rows[0]?.name || 'Student';
    const courseTitle = c.rows[0]?.title || 'Course';

    // 5) Choose transcript row: reuse existing id if present; else insert
    let tr;
    if (existingQ.rowCount) {
      tr = existingQ.rows[0];
      console.log('[transcripts] regenerating existing transcript', {
        id: tr.id,
        hasOverrides,
        force,
      });
    } else {
      const inserted = await pool.query(
        `INSERT INTO transcripts (id, student_id, course_id, url)
         VALUES (gen_random_uuid(), $1, $2, '')
         RETURNING *`,
        [userId, courseId],
      );
      tr = inserted.rows[0];
      console.log('[transcripts] inserted new transcript row', { id: tr.id });
    }

    // 6) Compute stats (client overrides win), and ALWAYS add Lessons Attempted
    const serverStats = await loadTranscriptScores(pool, userId, courseId);
    const lessonTitles = await loadAttemptedLessonTitles(
      pool,
      userId,
      courseId,
    ); // ensure even on client override
    const overallPct = clientOverallPct ?? serverStats.overallPct;
    const passMark = clientPassMark ?? serverStats.passMark;

    let sections = clientSections ?? serverStats.sections;
    sections = ensureLessonsSection(sections, lessonTitles);

    // 🔽 TITLES ONLY for "Lessons Learnt"
    const toLabels = (arr) =>
      Array.isArray(arr)
        ? arr
            .map((x) =>
              typeof x === 'string' ? x : x?.title || x?.label || '',
            )
            .map((s) => String(s).trim())
            .filter(Boolean)
        : [];
    const clientLessonsLearnt = provided('lessonsLearnt')
      ? value.lessonsLearnt
      : undefined;
    const lessonsLearnt = toLabels(clientLessonsLearnt).length
      ? toLabels(clientLessonsLearnt)
      : lessonTitles;

    console.log('[transcripts] stats resolved', {
      transcriptId: tr.id,
      overallPct,
      passMark,
      sectionsCount: Array.isArray(sections) ? sections.length : 0,
      lessonsCount: lessonTitles.length,
      from: {
        clientOverallPct,
        clientPassMark,
        clientSections: Array.isArray(clientSections)
          ? clientSections.length
          : 0,
        serverOverallPct: serverStats.overallPct,
        serverPassMark: serverStats.passMark,
        serverSections: Array.isArray(serverStats.sections)
          ? serverStats.sections.length
          : 0,
      },
    });

    const verificationUrl = `${base}/verify/transcript/${tr.id}`;

    // 7) Render in-memory PDF
    const buffer = await generateTranscriptPdfBuffer({
      studentId: userId,
      courseId,
      studentName,
      courseTitle,
      overallPct,
      passMark,
      lessonsLearnt,
      sections,
      previewNote: false, // hide "(Preview – watermark removed after payment)"
      watermarkText: null, // no watermark text at all
      verificationUrl,
    });

    if (!buffer || !buffer.length) {
      console.error('[transcripts] empty PDF buffer generated');
      return res
        .status(500)
        .json({ error: 'Failed to generate transcript PDF' });
    }

    // 8) Upload to Cloudinary (overwrite same public_id)
    const uploadPromise = new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image', // PDFs supported (first page thumbnail)
          folder: 'transcripts',
          public_id: tr.id,
          format: 'pdf',
          overwrite: true,
        },
        (err, result) => {
          if (err) {
            console.error('[transcripts] cloudinary upload error', err);
            reject(err);
          } else {
            resolve(result?.secure_url);
          }
        },
      );
      Readable.from(buffer).pipe(upload);
    });

    const uploadTimeoutMs = Number(
      process.env.TRANSCRIPT_UPLOAD_TIMEOUT_MS || 45000,
    );
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Cloudinary upload timed out')),
        uploadTimeoutMs,
      ),
    );

    const url = await Promise.race([uploadPromise, timeoutPromise]);
    if (!url) {
      console.error('[transcripts] upload returned empty url');
      return res.status(502).json({ error: 'Upload failed' });
    }

    // 9) Persist URL
    const updated = await pool.query(
      `UPDATE transcripts SET url = $1 WHERE id = $2 RETURNING *`,
      [url, tr.id],
    );
    const row = updated.rows[0];

    // 10) Build download_url (owner-checked server stream)
    const download_url = `${base}/api/transcripts/${row.id}/download`;

    console.log('[transcripts] generate done', {
      id: row.id,
      ms: Date.now() - t0,
    });
    return res.json({ ...row, download_url });
  } catch (err) {
    try {
      const cfg = cloudinary.config();
      logErr('[transcripts.generate] error', err, {
        cloudinary_cloud_name: cfg?.cloud_name,
        has_api_key: !!cfg?.api_key,
        has_api_secret: !!cfg?.api_secret,
      });
    } catch {
      logErr('[transcripts.generate] error (no cfg)', err);
    }
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}

/**
 * GET /api/transcripts/:id
 * Auth: owner not required (used for admin or internal—adjust as needed)
 */
export async function getTranscript(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id' });
    const q = await pool.query(`SELECT * FROM transcripts WHERE id = $1`, [id]);
    if (!q.rowCount) return res.status(404).json({ error: 'Not found' });
    return res.json(q.rows[0]);
  } catch (err) {
    logErr('[transcripts.get] error', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}

/**
 * GET /api/transcripts/:id/download
 * Auth: must be owner
 * Streams the PDF to the client; falls back to signed URL if needed.
 */
export async function downloadTranscript(req, res) {
  try {
    const studentId = req.user?.id;
    const { id } = req.params;

    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id' });
    if (!studentId) return res.status(401).json({ error: 'Unauthorized' });

    const { rows } = await pool.query(
      `SELECT id, student_id, course_id, url
         FROM transcripts
        WHERE id = $1`,
      [id],
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Transcript not found' });

    const tr = rows[0];
    if (tr.student_id !== studentId)
      return res.status(403).json({ error: 'Forbidden' });
    if (!tr.url)
      return res.status(400).json({ error: 'Transcript has no file URL yet' });

    const suggestedFilename = `transcript-${tr.id}.pdf`;

    const streamUrlToClient = async (url, note = 'public') => {
      console.log('[transcripts] streaming', { note, url });
      const upstream = await axios.get(url, {
        responseType: 'stream',
        validateStatus: () => true,
      });
      if (upstream.status !== 200) {
        const xErr = upstream.headers?.['x-cld-error'];
        const err = new Error(
          xErr
            ? `Cloudinary error: ${xErr}`
            : `Upstream fetch failed (${upstream.status})`,
        );
        err.status = upstream.status;
        throw err;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${suggestedFilename}"`,
      );
      const len = upstream.headers['content-length'];
      if (len) res.setHeader('Content-Length', len);
      upstream.data.on('error', (e) => {
        logErr('[transcripts] stream error', e);
        if (!res.headersSent)
          res.status(502).end('Failed to fetch transcript file');
        else res.end();
      });
      upstream.data.pipe(res);
    };

    // Try public URL first
    try {
      await streamUrlToClient(tr.url, 'public');
      return;
    } catch (e) {
      if (e?.status && e.status !== 401) {
        logErr('[transcripts] download upstream error (non-401)', e);
      }

      // Fall back to signed URLs
      const cfg = cloudinary.config() || {};
      if (!cfg.api_key || !cfg.api_secret) {
        console.error(
          '[transcripts] Missing Cloudinary API credentials for private download URL',
          {
            cloud_name: cfg.cloud_name,
            has_api_key: !!cfg.api_key,
            has_api_secret: !!cfg.api_secret,
          },
        );
        return res.status(502).json({
          error:
            'Cloudinary private download requires API credentials. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and restart the server.',
        });
      }

      const publicId =
        publicIdFromTranscriptUrl(tr.url) || `transcripts/${tr.id}`;

      const tryPrivateDownload = async (dlType) => {
        const privateUrl = cloudinary.utils.private_download_url(
          publicId,
          'pdf',
          {
            resource_type: 'image',
            type: dlType, // 'upload' | 'authenticated' | 'private'
            attachment: true,
            attachment_filename: suggestedFilename,
            expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
            sign_url: true,
          },
        );
        await streamUrlToClient(privateUrl, `private-download-${dlType}`);
      };

      // Our transcripts upload as type 'upload' — try that first
      const typesToTry = ['upload', 'authenticated', 'private'];
      for (const t of typesToTry) {
        try {
          await tryPrivateDownload(t);
          return;
        } catch (e2) {
          if (e2?.status && (e2.status === 401 || e2.status === 404)) {
            console.warn(
              '[transcripts] private_download_url failed; trying next type',
              {
                type: t,
                status: e2?.status,
              },
            );
            continue;
          }
          throw e2;
        }
      }

      // Last resort: signed delivery URL (authenticated), include version when present
      let version;
      try {
        const u = new URL(tr.url);
        const m = u.pathname.match(/\/v(\d+)\//);
        version = m ? m[1] : undefined;
      } catch {}

      const signedDeliveryUrl = cloudinary.utils.url(publicId, {
        resource_type: 'image',
        type: 'authenticated',
        format: 'pdf',
        sign_url: true,
        version,
      });
      await streamUrlToClient(
        signedDeliveryUrl,
        'signed-delivery-authenticated',
      );
    }
  } catch (err) {
    logErr('[transcripts.download] error', err);
    const status = (err && err.status) || 500;
    return res
      .status(status)
      .json({ error: err?.message || 'Download failed' });
  }
}
