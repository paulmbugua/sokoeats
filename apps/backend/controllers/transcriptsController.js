// apps/backend/controllers/transcriptsController.js
import Joi from 'joi';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import axios from 'axios';
import pool from '../config/db.js';
import { generateTranscriptPdfBuffer } from '../services/transcriptService.js';
import { isUuid, getEntitlement, upsertEntitlement } from './_entitlements.js';
import { getCertificateEntitlement } from './_aiCourseEntitlements.js';

const PROGRAM_TRACK_KEYS = ['module', 'certificate', 'diploma', 'degree'];
const PROGRAM_TRACK_SET = new Set(PROGRAM_TRACK_KEYS);
const DEBUG_TRANSCRIPTS = process.env.DEBUG_TRANSCRIPTS === '1';
// NOTE: Do NOT default `sections` here; otherwise an empty array would mask server stats.
const genSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
  overallPct: Joi.number().min(0).max(100).optional(),
  passMark: Joi.number().min(0).max(100).optional(),
  programTrack: Joi.string().trim().lowercase().valid(...PROGRAM_TRACK_KEYS).optional(),

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

// ─────────────────────────────────────────────────────────────
// Quiz attempt shape detection (match cert-style robustness)
// ─────────────────────────────────────────────────────────────
let _quizAttemptsShapeCache = null;
const QUIZ_TIME_COL_CACHE = new Map();

async function pickTimeColumn(db, tableName) {
  if (QUIZ_TIME_COL_CACHE.has(tableName)) return QUIZ_TIME_COL_CACHE.get(tableName);

  const candidates = ['submitted_at', 'completed_at', 'graded_at', 'created_at', 'updated_at'];
  const q = await db.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND column_name = ANY($2::text[])
    `,
    [tableName, candidates],
  );

  const found = candidates.find((c) => q.rows.some((r) => r.column_name === c)) ?? null;
  QUIZ_TIME_COL_CACHE.set(tableName, found);
  return found;
}

async function detectQuizAttemptsShape(db) {
  if (_quizAttemptsShapeCache) return _quizAttemptsShapeCache;

  try {
    const q = await db.query(
      `
      SELECT column_name, data_type
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='quiz_attempts'
      `,
    );

    const map = new Map(q.rows.map((r) => [r.column_name, r.data_type]));
    const timeCol = await pickTimeColumn(db, 'quiz_attempts');

    _quizAttemptsShapeCache = {
      exists: q.rows.length > 0,

      // user identity
      hasUserId: map.has('user_id'),
      userIdType: map.get('user_id') || null, // uuid|integer|bigint|...
      hasStudentId: map.has('student_id'),
      studentIdType: map.get('student_id') || null,

      // course + quiz
      hasCourseId: map.has('course_id'),
      courseIdType: map.get('course_id') || null, // uuid|text|varchar...
      hasQuizId: map.has('quiz_id'),
      hasTitle: map.has('title'),

      // score
      hasScorePct: map.has('score_pct'),
      hasPassMark: map.has('pass_mark'),

      timeCol,
    };

    return _quizAttemptsShapeCache;
  } catch (e) {
    _quizAttemptsShapeCache = { exists: false };
    return _quizAttemptsShapeCache;
  }
}

// deterministic uuid (same as your cert + entitlements)
import crypto from 'node:crypto';
function anonToUuid(s) {
  const hex = crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(
    17,
    20,
  )}-${hex.slice(20)}`;
}

// ─────────────────────────────────────────────────────────────
// Resolve auth UUID for numeric users.id (best-effort, cached)
// ─────────────────────────────────────────────────────────────
let _authUuidShapeCache = null;

async function detectAuthUuidShape(db) {
  if (_authUuidShapeCache) return _authUuidShapeCache;

  const candCols = ['auth_uuid', 'auth_user_id', 'user_uuid', 'authUserId'];

  const usersCols = await db.query(
    `
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='users'
       AND column_name = ANY($1::text[])
    `,
    [candCols],
  );

  const profCols = await db.query(
    `
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='profiles'
       AND column_name = ANY($1::text[])
    `,
    [candCols],
  );

  const uMap = new Map(usersCols.rows.map((r) => [r.column_name, r.data_type]));
  const pMap = new Map(profCols.rows.map((r) => [r.column_name, r.data_type]));

  const usersAuthUuidCol = candCols.find((c) => uMap.get(c) === 'uuid') || null;
  const profilesAuthUuidCol = candCols.find((c) => pMap.get(c) === 'uuid') || null;

  const profilesUserIdIsNumeric =
    pMap.get('user_id') === 'integer' || pMap.get('user_id') === 'bigint';

  _authUuidShapeCache = { usersAuthUuidCol, profilesAuthUuidCol, profilesUserIdIsNumeric };
  return _authUuidShapeCache;
}

async function resolveAuthUuidForNumericUserId(db, userIdNum) {
  const n = Number(userIdNum);
  if (!Number.isFinite(n)) return null;

  try {
    const shape = await detectAuthUuidShape(db);

    // 1) users table
    if (shape.usersAuthUuidCol) {
      try {
        const q = await db.query(
          `SELECT ${shape.usersAuthUuidCol}::text AS uid FROM users WHERE id = $1 LIMIT 1`,
          [n],
        );
        const uid = q.rows?.[0]?.uid ? String(q.rows[0].uid) : null;
        if (uid && isUuid(uid)) return uid;
      } catch {}
    }

    // 2) profiles table
    if (shape.profilesAuthUuidCol) {
      if (shape.profilesUserIdIsNumeric) {
        const q = await db.query(
          `SELECT ${shape.profilesAuthUuidCol}::text AS uid FROM profiles WHERE user_id = $1 LIMIT 1`,
          [n],
        );
        const uid = q.rows?.[0]?.uid ? String(q.rows[0].uid) : null;
        if (uid && isUuid(uid)) return uid;
      }

      const q2 = await db.query(
        `SELECT ${shape.profilesAuthUuidCol}::text AS uid FROM profiles WHERE id = $1 LIMIT 1`,
        [n],
      );
      const uid2 = q2.rows?.[0]?.uid ? String(q2.rows[0].uid) : null;
      if (uid2 && isUuid(uid2)) return uid2;
    }
  } catch {}

  return null;
}

// ─────────────────────────────────────────────────────────────
// Course outline → titles (for Lessons Learnt)
// ─────────────────────────────────────────────────────────────
function extractTitlesFromAnyOutline(obj, { max = 200 } = {}) {
  const out = [];
  const seen = new Set(); // case-insensitive de-dup
  const seenObj = new WeakSet();

  const push = (s) => {
    if (out.length >= max) return;
    const t = String(s ?? '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    // ignore giant blobs (e.g., JSON stringified dumps)
    if (t.length > 160) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  const valueKeys = [
    'title','label','name','topic','heading',
    'weekTitle','week_title','unitTitle','unit_title',
    'moduleTitle','module_title','lessonTitle','lesson_title',
    'objective','objectives'
  ];

  const nestKeys = [
    'syllabus','outline','weeks','sections','lessons','items',
    'topics','subtopics','units','modules','chapters','parts',
    'activities','exercises','content'
  ];

  const walk = (x, depth = 0) => {
    if (!x || out.length >= max || depth > 14) return;
    if (typeof x === 'string') return push(x);
    if (Array.isArray(x)) {
      for (const it of x) walk(it, depth + 1);
      return;
    }
    if (typeof x === 'object') {
      if (seenObj.has(x)) return;
      seenObj.add(x);

      for (const k of valueKeys) {
        const v = x[k];
        if (typeof v === 'string') push(v);
        else if (Array.isArray(v)) v.forEach((s) => push(s));
      }

      for (const k of nestKeys) {
        const v = x[k];
        if (v) walk(v, depth + 1);
      }
    }
  };

  walk(obj, 0);
  return out;
}


function tryParseJson(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if (!s) return v;
  if (!(s.startsWith('{') || s.startsWith('['))) return v;
  try {
    return JSON.parse(s);
  } catch {
    return v;
  }
}

function extractOutlineTitlesSmart(v, { max = 200 } = {}) {
  const x = tryParseJson(v);

  // common AI outline shape: Array<{title,...}>
  if (Array.isArray(x)) {
    const titles = x
      .map((it) => it?.title || it?.weekTitle || it?.lessonTitle || it?.name || it?.label)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    if (titles.length) return titles.slice(0, max);
  }

  // common course package shape: { outline: [...] }
  if (x && typeof x === 'object') {
    const arr =
      (Array.isArray(x.outline) && x.outline) ||
      (Array.isArray(x.weeks) && x.weeks) ||
      (Array.isArray(x.sections) && x.sections) ||
      null;

    if (arr) {
      const titles = arr
        .map((it) => it?.title || it?.weekTitle || it?.lessonTitle || it?.name || it?.label)
        .map((s) => String(s || '').trim())
        .filter(Boolean);
      if (titles.length) return titles.slice(0, max);
    }
  }

  // fallback to your deep walker (but after parsing JSON strings)
  return extractTitlesFromAnyOutline(x, { max });
}

async function loadCourseOutlineTitles(db, courseId) {
  let best = [];
  let bestCol = null;

  // 1) Try syllabus but DO NOT early return
  try {
    const q = await db.query(
      `SELECT syllabus FROM courses WHERE id = $1::uuid LIMIT 1`,
      [courseId],
    );
    if (q.rowCount) {
      const titles = extractOutlineTitlesSmart(q.rows[0]?.syllabus);
      if (titles.length > best.length) {
        best = titles;
        bestCol = 'syllabus';
      }
    }
  } catch {}

  // 2) Scan other likely columns and choose the biggest
  try {
    const colsQ = await db.query(
      `
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='courses'
         AND (
              column_name ILIKE '%outline%'
           OR column_name ILIKE '%syllabus%'
           OR column_name ILIKE '%section%'
           OR column_name ILIKE '%week%'
           OR column_name ILIKE '%lesson%'
         )
      `,
    );

    const cols = (colsQ.rows || [])
      .map((r) => r.column_name)
      .filter((c) => c !== 'syllabus') // we already sampled it
      .slice(0, 25);

    for (const col of cols) {
      try {
        const r = await db.query(
          `SELECT "${col}" AS v FROM courses WHERE id = $1::uuid LIMIT 1`,
          [courseId],
        );
        const titles = extractOutlineTitlesSmart(r.rows?.[0]?.v);
        if (titles.length > best.length) {
          best = titles;
          bestCol = col;
        }
      } catch {}
    }

    console.log('[transcripts.outline] picked', {
      courseId,
      col: bestCol,
      count: best.length,
      sample: best.slice(0, 8),
    });

    return best;
  } catch {
    return best;
  }
}


// near the top of apps/backend/controllers/transcriptsController.js



// ─────────────────────────────────────────────────────────────
// ProgramTrack plumbing (DB → PDF)
// ─────────────────────────────────────────────────────────────


let _courseTrackColCache = undefined;
let _aiEntTrackColCache = undefined;

function normalizeProgramTrack(v) {
  const s = String(v || '').trim().toLowerCase();
  return PROGRAM_TRACK_SET.has(s) ? s : null;
}

async function detectTrackColumn(db, tableName) {
  const candidates = ['program_track', 'programtrack', 'program_track_key', 'track'];

  if (tableName === 'courses' && _courseTrackColCache !== undefined) return _courseTrackColCache;
  if (tableName === 'ai_course_entitlements' && _aiEntTrackColCache !== undefined)
    return _aiEntTrackColCache;

  const q = await db.query(
    `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name=$1
       AND column_name = ANY($2::text[])
    `,
    [tableName, candidates],
  );

  const found = candidates.find((c) => q.rows.some((r) => r.column_name === c)) ?? null;

  if (tableName === 'courses') _courseTrackColCache = found;
  if (tableName === 'ai_course_entitlements') _aiEntTrackColCache = found;

  return found;
}

async function loadCourseProgramTrack(courseId) {
  const col = await detectTrackColumn(pool, 'courses');
  if (!col) return null;

  try {
    const q = await pool.query(
      `SELECT "${col}" AS track FROM courses WHERE id = $1::uuid LIMIT 1`,
      [courseId],
    );
    return normalizeProgramTrack(q.rows?.[0]?.track);
  } catch (e) {
    if (String(e?.code) === '42703') return null;
    throw e;
  }
}

function pickAuthUuidFromReqUser(u) {
  const cand = [u?.uid, u?.sub, u?.auth_user_id, u?.user_uuid, u?.userIdUuid, u?.userUUID];
  for (const v of cand) {
    if (isUuid(v)) return String(v);
  }
  return null;
}

async function loadEntitlementProgramTrack(authUuid, courseId) {
  if (!authUuid || !isUuid(authUuid)) return null;

  const col = await detectTrackColumn(pool, 'ai_course_entitlements');
  if (!col) return null;

  try {
    const q = await pool.query(
      `
      SELECT "${col}" AS track
        FROM ai_course_entitlements
       WHERE user_id = $1::uuid
         AND course_id::text = $2::text
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1
      `,
      [authUuid, courseId],
    );
    return normalizeProgramTrack(q.rows?.[0]?.track);
  } catch (e) {
    if (['42P01', '42703', '22P02'].includes(String(e?.code))) return null;
    throw e;
  }
}

async function resolveProgramTrack({ courseId, authUuid, reqTrack }) {
  const fromCourse = await loadCourseProgramTrack(courseId);
  if (fromCourse) return fromCourse;

  const fromEnt = await loadEntitlementProgramTrack(authUuid, courseId);
  if (fromEnt) return fromEnt;

  return normalizeProgramTrack(reqTrack);
}


function getRid(req) {
  return (
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  );
}

function logT(tag, obj) {
  if (!DEBUG_TRANSCRIPTS) return;
  console.log(tag, obj);
}


function reqTag(req) {
  const rid =
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const uid = req.user?.id;
  const uidType =
    typeof uid === 'string' && /^[0-9a-f-]{36}$/i.test(uid)
      ? 'uuid'
      : typeof uid === 'number'
        ? 'number'
        : typeof uid;

  return { rid, uid, uidType, path: req.originalUrl, method: req.method };
}

function logInfo(tag, payload) {
  console.log(tag, payload);
}

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
async function loadTranscriptScores(db, { userId, authUuid, courseId, rid }) {
  const uidNum = Number(userId);
  const fallbackPassMark = 70;

  const shape = await detectQuizAttemptsShape(db);
  logT('[transcripts.scores] quiz_attempts_shape', { rid, shape });

  // 1) ORG attempts (most reliable in your org flow)
  const orgRows = await db
    .query(
      `
      SELECT
        qa.score_pct::float AS score_pct,
        qa.pass_mark::float AS pass_mark,
        'Org Assignment'::text AS title
      FROM org_quiz_attempts qa
      JOIN org_course_assignments a ON a.id = qa.assignment_id
      WHERE qa.user_id = $1::bigint
        AND a.course_id = $2::uuid
        AND qa.submitted_at IS NOT NULL
      ORDER BY qa.submitted_at DESC NULLS LAST, qa.id DESC
      LIMIT 20
      `,
      [uidNum, courseId],
    )
    .then((r) => r.rows || [])
    .catch((e) => {
      logT('[transcripts.scores] org_attempts_failed', { rid, msg: e?.message, code: e?.code });
      return [];
    });

  // 2) PERSONAL attempts (schema-adaptive)
  let personalRows = [];
  if (shape?.exists && shape.hasScorePct && shape.hasCourseId) {
    const timeCol = shape.timeCol;
    const timeFilter = timeCol ? `AND qa."${timeCol}" IS NOT NULL` : '';
    const orderExpr = timeCol ? `qa."${timeCol}" DESC NULLS LAST, qa.id DESC` : `qa.id DESC`;

    // Title from quizzes.json (since quizzes has no title column)
const titleExpr =
  "COALESCE(NULLIF(q.json->>'title',''), NULLIF(q.json->>'name',''), 'Quiz')";

// IMPORTANT: quiz_attempts.quiz_id can be NULL → don't collapse NULLs into one group
const partitionKey = 'COALESCE(qa.quiz_id, qa.id)';


    // compute uuid candidate (only when we need it)
    const authUuidResolved =
      (authUuid && isUuid(authUuid) ? String(authUuid) : null) ||
      (Number.isFinite(uidNum) ? await resolveAuthUuidForNumericUserId(db, uidNum) : null) ||
      (Number.isFinite(uidNum) ? anonToUuid(`user:${uidNum}`) : null);

    const courseWhere = `qa.course_id::text = $2::text`;

    const tryQuery = async (sql, params, tag) => {
      try {
        const r = await db.query(sql, params);
        logT('[transcripts.scores] personal_query_ok', {
          rid,
          tag,
          rows: r.rowCount,
          timeCol,
          userKey: tag,
        });
        return r.rows || [];
      } catch (e) {
        logT('[transcripts.scores] personal_query_fail', {
          rid,
          tag,
          msg: e?.message,
          code: e?.code,
        });
        return [];
      }
    };

    // A) student_id numeric
    if (
      shape.hasStudentId &&
      (shape.studentIdType === 'integer' || shape.studentIdType === 'bigint') &&
      Number.isFinite(uidNum)
    ) {
      const hasQuizId = shape.hasQuizId;

     const sql = `
  SELECT title, score_pct, pass_mark
  FROM (
    SELECT
      ${titleExpr} AS title,
      qa.score_pct::float AS score_pct,
      qa.pass_mark::float AS pass_mark,
      row_number() OVER (PARTITION BY ${partitionKey} ORDER BY ${orderExpr}) AS rn
    FROM quiz_attempts qa
    LEFT JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.student_id = $1::bigint
      AND qa.course_id::text = $2::text
      ${timeFilter}
  ) t
  WHERE rn = 1
`;
personalRows = await tryQuery(sql, [uidNum, courseId], 'student_id:numeric');

    }

    // B) user_id uuid
    if (!personalRows.length && shape.hasUserId && shape.userIdType === 'uuid' && authUuidResolved) {
      const hasQuizId = shape.hasQuizId;

     const sql = `
  SELECT title, score_pct, pass_mark
  FROM (
    SELECT
      ${titleExpr} AS title,
      qa.score_pct::float AS score_pct,
      qa.pass_mark::float AS pass_mark,
      row_number() OVER (PARTITION BY ${partitionKey} ORDER BY ${orderExpr}) AS rn
    FROM quiz_attempts qa
    LEFT JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.user_id = $1::uuid
      AND qa.course_id::text = $2::text
      ${timeFilter}
  ) t
  WHERE rn = 1
`;
personalRows = await tryQuery(sql, [authUuidResolved, courseId], 'user_id:uuid');

    }

    // C) user_id numeric
    if (
      !personalRows.length &&
      shape.hasUserId &&
      (shape.userIdType === 'integer' || shape.userIdType === 'bigint') &&
      Number.isFinite(uidNum)
    ) {
      const hasQuizId = shape.hasQuizId;

     const sql = `
  SELECT title, score_pct, pass_mark
  FROM (
    SELECT
      ${titleExpr} AS title,
      qa.score_pct::float AS score_pct,
      qa.pass_mark::float AS pass_mark,
      row_number() OVER (PARTITION BY ${partitionKey} ORDER BY ${orderExpr}) AS rn
    FROM quiz_attempts qa
    LEFT JOIN quizzes q ON q.id = qa.quiz_id
    WHERE qa.user_id = $1::bigint
      AND qa.course_id::text = $2::text
      ${timeFilter}
  ) t
  WHERE rn = 1
`;
personalRows = await tryQuery(sql, [uidNum, courseId], 'user_id:numeric');


    }
  } else {
    logT('[transcripts.scores] quiz_attempts_unusable', {
      rid,
      exists: shape?.exists,
      hasScorePct: shape?.hasScorePct,
      hasCourseId: shape?.hasCourseId,
    });
  }

  // Choose best source
  const picked = personalRows.length ? { source: 'personal', rows: personalRows } : { source: 'org', rows: orgRows };

  logT('[transcripts.scores] picked_source', {
    rid,
    source: picked.source,
    rows: picked.rows.length,
    sample: picked.rows.slice(0, 3),
  });

  if (!picked.rows.length) return { overallPct: null, passMark: fallbackPassMark, sections: [] };

  const toPct = (x) => {
    const n = Number(x);
    if (!Number.isFinite(n)) return null;
    return n > 0 && n <= 1 ? n * 100 : n;
  };

  const normalized = picked.rows
    .map((r) => ({
      title: r.title || 'Quiz',
      score_pct: toPct(r.score_pct),
      pass_mark: toPct(r.pass_mark) ?? fallbackPassMark,
    }))
    .filter((r) => r.score_pct != null);

  if (!normalized.length) return { overallPct: null, passMark: fallbackPassMark, sections: [] };

  // ✅ Final score = highest score (best attempt) instead of average
    const best = normalized.reduce((b, r) => (r.score_pct > b.score_pct ? r : b), normalized[0]);

    const overallPct = Math.round(best.score_pct * 100) / 100;

    // passMark: use the passMark that belongs to the best score (fallback safe)
    const passMark = Math.round(((best.pass_mark ?? fallbackPassMark) * 100)) / 100;


  const sections = [
    {
      sectionTitle: 'Quiz Scores',
      items: normalized.map((r) => ({
        label: r.title,
        scorePct: Math.round(r.score_pct * 100) / 100,
      })),
    },
  ];

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

function computeOverallPctFromSections(sections) {
  const secs = Array.isArray(sections) ? sections : [];

  // Prefer quiz scores only (avoid "Lessons Attempted" = 100 skew)
  const quizSecs = secs.filter((s) =>
    /quiz/i.test(String(s?.sectionTitle || '')),
  );
  const use = quizSecs.length ? quizSecs : secs.filter((s) => !/lesson/i.test(String(s?.sectionTitle || '')));

  const items = use.flatMap((s) => (Array.isArray(s?.items) ? s.items : []));
  const nums = items
    .map((it) => Number(it?.scorePct))
    .filter((n) => Number.isFinite(n));

  if (!nums.length) return null;
  const best = Math.max(...nums);
  return Math.round(best * 100) / 100;

}

function clampPct(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
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
// apps/backend/controllers/transcriptsController.js
// FULL handler with logs + your existing logic kept intact.

export async function generateTranscript(req, res) {
  const t0 = Date.now();
  const rid = getRid(req);

  try {
    logT('[transcripts.generate] enter', {
      rid,
      path: req.originalUrl,
      method: req.method,
      uid: req.user?.id,
      uidType: typeof req.user?.id,
      bodyCourseId: req.body?.courseId,
      hasToken: Boolean(req.headers?.authorization),
    });

    const { error, value } = genSchema.validate(req.body);
    if (error) {
      logT('[transcripts.generate] bad_body', { rid, msg: error.message });
      return res.status(400).json({ error: error.message });
    }

    const userId = req.user?.id;
    const { courseId } = value;

    if (!userId) {
      logT('[transcripts.generate] unauthorized', { rid });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isUuid(courseId)) {
      logT('[transcripts.generate] invalid_courseId', { rid, courseId });
      return res.status(400).json({ error: 'Invalid courseId' });
    }

    const authUuid = pickAuthUuidFromReqUser(req.user);

    const programTrack = await resolveProgramTrack({
      courseId,
      authUuid,
      reqTrack: value.programTrack, // optional (validated)
    });

    logT('[transcripts.generate] resolved programTrack', {
      rid,
      courseId,
      programTrack,
      hasAuthUuid: Boolean(authUuid),
    });

    // Define once and reuse everywhere (avoid “Cannot redeclare 'base'”)
    const base = (
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    ).replace(/\/+$/, '');

    // Only treat client fields as overrides if actually provided in the payload.
    const provided = (k) => Object.prototype.hasOwnProperty.call(value, k);
   const clientSectionsProvided =
  provided('sections') && Array.isArray(value.sections) && value.sections.length > 0;

    const clientOverallPctRaw = provided('overallPct') ? value.overallPct : undefined;

    // ✅ If client sends default 0 but didn't send any sections, ignore it.
    // (real 0% would still come from serverStats.sections / quiz_attempts)
    const clientOverallPct =
      clientOverallPctRaw === 0 && !clientSectionsProvided ? undefined : clientOverallPctRaw;

    const clientPassMark = provided('passMark') ? value.passMark : undefined;
    const clientSections = provided('sections') ? value.sections : undefined;
    const force = value.force === true;

    logT('[transcripts.generate] normalized_input', {
      rid,
      userId,
      userIdType: typeof userId,
      courseId,
      overrides: {
        overallPct: clientOverallPct !== undefined,
        passMark: clientPassMark !== undefined,
        sections: Array.isArray(clientSections) ? clientSections.length : 0,
        force,
      },
    });

    // ─────────────────────────────────────────────────────────────
    // 1) Eligibility (UPDATED)
    // Sources:
    // - org coverage
    // - legacy entitlements (can_transcript)
    // - completion certificate row (certificates table)
    // - AI cert entitlement (ai_course_entitlements purchase_type='certificate')
    // ─────────────────────────────────────────────────────────────
    const [orgCovered, ent, aiCertEnt, certRowQ] = await Promise.all([
      hasOrgCoverForCourse(userId, courseId).catch((e) => {
        logT('[transcripts.generate] orgCovered error', { rid, msg: e?.message });
        return false;
      }),

      getEntitlement(pool, userId, courseId).catch((e) => {
        logT('[transcripts.generate] getEntitlement error', {
          rid,
          uid: userId,
          uidType: typeof userId,
          msg: e?.message,
          code: e?.code,
        });
        return null;
      }),

      getCertificateEntitlement(userId, courseId).catch((e) => {
        logT('[transcripts.generate] getCertificateEntitlement error', {
          rid,
          uid: userId,
          uidType: typeof userId,
          msg: e?.message,
          code: e?.code,
        });
        return null;
      }),

      pool
        .query(
          `SELECT 1 FROM certificates WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
          [userId, courseId],
        )
        .catch((e) => {
          logT('[transcripts.generate] certificates lookup error', {
            rid,
            msg: e?.message,
            code: e?.code,
          });
          return { rowCount: 0, rows: [] };
        }),
    ]);

    const hasCompletionCert = certRowQ?.rowCount > 0;
    const hasAiCertPurchase = Boolean(aiCertEnt); // narration unlock stored in ai_course_entitlements

    let canTranscript =
      Boolean(orgCovered) ||
      ent?.can_transcript === true ||
      hasCompletionCert ||
      hasAiCertPurchase;

    logT('[transcripts.generate] gate_check', {
      rid,
      courseId,
      orgCovered,
      entFound: Boolean(ent),
      ent_can_transcript: ent?.can_transcript,
      hasCompletionCert,
      hasAiCertPurchase,
      canTranscript_initial: canTranscript,
    });

    // Optional auto-heal: if they qualify, ensure legacy entitlement reflects it
    if (canTranscript && (!ent || ent?.can_transcript !== true)) {
      try {
        await upsertEntitlement(pool, { userId, courseId, extended: true });
        logT('[transcripts.generate] autoheal_entitlement_ok', {
          rid,
          userId,
          courseId,
          reason: 'qualified_by_any_source',
        });
      } catch (e) {
        logT('[transcripts.generate] autoheal_entitlement_fail', {
          rid,
          msg: e?.message,
        });
      }
    }

    // 2) Extended via issuance (keep your existing fallback, auto-heal)
    let viaIssuance = false;
    if (!canTranscript) {
      viaIssuance = await hasExtendedByIssuance(userId, courseId).catch((e) => {
        logT('[transcripts.generate] hasExtendedByIssuance error', {
          rid,
          msg: e?.message,
          code: e?.code,
        });
        return false;
      });

      logT('[transcripts.generate] issuance_check', { rid, viaIssuance });

      if (viaIssuance) {
        canTranscript = true;
        try {
          await upsertEntitlement(pool, { userId, courseId, extended: true });
          logT('[transcripts.generate] autoheal_entitlement_ok', {
            rid,
            userId,
            courseId,
            reason: 'via_issuance',
          });
        } catch (e) {
          console.warn('[transcripts] upsertEntitlement (auto-heal) failed:', e?.message);
          logT('[transcripts.generate] autoheal_entitlement_fail', { rid, msg: e?.message });
        }
      }
    }

    if (!canTranscript) {
      logT('[transcripts.generate] blocked', {
        rid,
        reason: 'EXTENDED_REQUIRED',
        orgCovered,
        ent_can_transcript: ent?.can_transcript,
        hasCompletionCert,
        hasAiCertPurchase,
        viaIssuance,
      });

      return res.status(402).json({
        error: 'EXTENDED_REQUIRED',
        message: 'Transcripts are included with the certificate purchase (or org coverage).',
      });
    }

    // 3) Existing transcript logic (idempotent unless overrides/force)
    const existingQ = await pool.query(
      `SELECT * FROM transcripts
        WHERE student_id = $1 AND course_id = $2
        ORDER BY created_at DESC
        LIMIT 1`,
      [userId, courseId],
    );

    const hasOverrides =
      clientOverallPct !== undefined ||
      clientPassMark !== undefined ||
      Array.isArray(clientSections);

    logT('[transcripts.generate] existing_check', {
      rid,
      existing: existingQ.rowCount,
      hasOverrides,
      force,
    });

    if (existingQ.rowCount && !hasOverrides && !force) {
  const row = existingQ.rows[0];
  const hasUrl = Boolean(String(row.url || '').trim());

  // ✅ Only reuse if the file is actually uploaded
  if (hasUrl) {
    const download_url = `${base}/api/transcripts/${row.id}/download`;
    logT('[transcripts.generate] reuse_existing', {
      rid,
      id: row.id,
      url: '[has_url]',
    });
    return res.json({ ...row, download_url });
  }

  // ✅ Otherwise fall through and regenerate/upload using same row
  logT('[transcripts.generate] existing_row_missing_url_regenerate', {
    rid,
    id: row.id,
  });
}
    // 4) Minimal info for the PDF
    const u = await pool.query(`SELECT name FROM users WHERE id = $1`, [userId]);
    const c = await pool.query(`SELECT title FROM courses WHERE id = $1`, [courseId]);
    const studentName = u.rows[0]?.name || 'Student';
    const courseTitle = c.rows[0]?.title || 'Course';

    logT('[transcripts.generate] meta_loaded', {
      rid,
      studentName,
      courseTitle,
      userFound: Boolean(u.rowCount),
      courseFound: Boolean(c.rowCount),
    });

    // 5) Choose transcript row: reuse existing id if present; else insert
    let tr;
    if (existingQ.rowCount) {
      tr = existingQ.rows[0];
      logT('[transcripts.generate] regenerating_existing_row', {
        rid,
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
      logT('[transcripts.generate] inserted_new_row', { rid, id: tr.id });
    }

    // 6) Compute stats (client overrides win), and ALWAYS add Lessons Attempted
    const serverStats = await loadTranscriptScores(pool, {
  userId,
  authUuid,
  courseId,
  rid,
});

const lessonTitles = await loadAttemptedLessonTitles(pool, userId, courseId);
const outlineTitles = await loadCourseOutlineTitles(pool, courseId);

console.log('[transcripts.generate] outline resolved', {
  courseId,
  outlineCount: Array.isArray(outlineTitles) ? outlineTitles.length : 0,
  outlineSample: (outlineTitles || []).slice(0, 10),
});


logT('[transcripts.generate] lessons_sources', {
  rid,
  attemptedCount: Array.isArray(lessonTitles) ? lessonTitles.length : 0,
  outlineCount: Array.isArray(outlineTitles) ? outlineTitles.length : 0,
  outlineSample: (outlineTitles || []).slice(0, 8),
});

    let passMark = clientPassMark ?? serverStats.passMark ?? 70;

let sections = clientSections ?? serverStats.sections;
sections = ensureLessonsSection(sections, lessonTitles);

// 1) Start with explicit overallPct if client sent it, else server
let overallPct = clientOverallPct ?? serverStats.overallPct;

// 2) If missing, compute from sections (prefer Quiz Scores; exclude lessons)
if (overallPct == null) {
  overallPct = computeOverallPctFromSections(sections);
}

// 3) If still missing, fallback to enrollments.progress (0–100)
if (overallPct == null) {
  const r = await pool.query(
    `SELECT progress
       FROM enrollments
      WHERE student_id = $1
        AND course_id = $2::uuid
      LIMIT 1`,
    [userId, courseId],
  );
  overallPct = clampPct(r.rows?.[0]?.progress);

  if (
  overallPct === 0 &&
  (!Array.isArray(sections) || sections.length === 0) &&
  (!Array.isArray(serverStats?.sections) || serverStats.sections.length === 0)
) {
  overallPct = null;
}
}

// temp debug (optional)
logT('[transcripts.generate] score inputs', {
  rid,
  courseId,
  userId,
  overallPct,
  passMark,
  sectionsCount: Array.isArray(sections) ? sections.length : 0,
});


    // TITLES ONLY for "Lessons Learnt"
    const toLabels = (arr) =>
      Array.isArray(arr)
        ? arr
            .map((x) => (typeof x === 'string' ? x : x?.title || x?.label || ''))
            .map((s) => String(s).trim())
            .filter(Boolean)
        : [];
const clientLessonsLearnt = provided('lessonsLearnt') ? value.lessonsLearnt : undefined;

const lessonsLearnt = toLabels(clientLessonsLearnt).length
  ? toLabels(clientLessonsLearnt)
  : outlineTitles?.length
    ? outlineTitles
    : lessonTitles;

    logT('[transcripts.generate] stats_resolved', {
      rid,
      transcriptId: tr.id,
      overallPct,
      passMark,
      sectionsCount: Array.isArray(sections) ? sections.length : 0,
      lessonsCount: Array.isArray(lessonTitles) ? lessonTitles.length : 0,
      lessonsLearntCount: Array.isArray(lessonsLearnt) ? lessonsLearnt.length : 0,
      from: {
        clientOverallPct,
        clientPassMark,
        clientSectionsLen: Array.isArray(clientSections) ? clientSections.length : 0,
        serverOverallPct: serverStats.overallPct,
        serverPassMark: serverStats.passMark,
        serverSectionsLen: Array.isArray(serverStats.sections)
          ? serverStats.sections.length
          : 0,
      },
    });

    const verificationUrl = `${base}/verify/transcript/${tr.id}`;

    console.log('[transcripts.generate] FINAL before PDF', {
    courseId,
    overallPct,
    passMark,
    sectionsCount: Array.isArray(sections) ? sections.length : 0,
    sectionTitles: (sections || []).map(s => s.sectionTitle),
  });


    // 7) Render in-memory PDF
    const buffer = await generateTranscriptPdfBuffer({
      studentId: userId,
      courseId,
      studentName,
      courseTitle,
      programTrack,
      overallPct,
      passMark,
      lessonsLearnt,
      sections,
      previewNote: false,
      watermarkText: null,
      verificationUrl,
    });

    if (!buffer || !buffer.length) {
      logT('[transcripts.generate] pdf_empty', { rid, transcriptId: tr.id });
      return res.status(500).json({ error: 'Failed to generate transcript PDF' });
    }

    logT('[transcripts.generate] pdf_ready', {
      rid,
      transcriptId: tr.id,
      bytes: buffer.length,
    });

    // 8) Upload to Cloudinary (overwrite same public_id)
    const uploadPromise = new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image', // PDFs supported
          folder: 'transcripts',
          public_id: tr.id,
          format: 'pdf',
          overwrite: true,
        },
        (err, result) => {
          if (err) {
            logErr('[transcripts] cloudinary upload error', err, {
              rid,
              transcriptId: tr.id,
            });
            reject(err);
          } else {
            resolve(result?.secure_url);
          }
        },
      );
      Readable.from(buffer).pipe(upload);
    });

    const uploadTimeoutMs = Number(process.env.TRANSCRIPT_UPLOAD_TIMEOUT_MS || 45000);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloudinary upload timed out')), uploadTimeoutMs),
    );

    const url = await Promise.race([uploadPromise, timeoutPromise]);

    if (!url) {
      logT('[transcripts.generate] upload_empty_url', { rid, transcriptId: tr.id });
      return res.status(502).json({ error: 'Upload failed' });
    }

    logT('[transcripts.generate] uploaded', {
      rid,
      transcriptId: tr.id,
      url: String(url),
    });

    // 9) Persist URL
    const updated = await pool.query(
      `UPDATE transcripts SET url = $1 WHERE id = $2 RETURNING *`,
      [url, tr.id],
    );
    const row = updated.rows[0];

    // 10) Build download_url (owner-checked server stream)
    const download_url = `${base}/api/transcripts/${row.id}/download`;

    logT('[transcripts.generate] done', {
      rid,
      id: row.id,
      ms: Date.now() - t0,
      hasUrl: Boolean(row.url),
      download_url,
    });

    return res.json({ ...row, download_url });
  } catch (err) {
    try {
      const cfg = cloudinary.config();
      logErr('[transcripts.generate] error', err, {
        rid,
        cloudinary_cloud_name: cfg?.cloud_name,
        has_api_key: !!cfg?.api_key,
        has_api_secret: !!cfg?.api_secret,
      });
    } catch {
      logErr('[transcripts.generate] error (no cfg)', err, { rid });
    }
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}


/**
 * GET /api/transcripts/:id
 * Auth: owner not required (used for admin or internal—adjust as needed)
 */
export async function getTranscript(req, res) {
  const meta = reqTag(req);
  try {
    const { id } = req.params;

    if (!isUuid(id)) {
      logInfo('[transcripts.get] invalid id (likely route mismatch)', { ...meta, id });
      return res.status(400).json({ error: 'Invalid id' });
    }

    const q = await pool.query(`SELECT * FROM transcripts WHERE id = $1`, [id]);
    if (!q.rowCount) {
      logInfo('[transcripts.get] not found', { ...meta, id });
      return res.status(404).json({ error: 'Not found' });
    }

    return res.json(q.rows[0]);
  } catch (err) {
    logErr('[transcripts.get] error', err, meta);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}


/**
 * GET /api/transcripts/:id/download
 * Auth: must be owner
 * Streams the PDF to the client; falls back to signed URL if needed.
 */
export async function downloadTranscript(req, res) {
  const rid = getRid(req);

  try {
    const userId = req.user?.id;
    const id = String(req.params?.id || '').trim();

    logT('[transcripts.download] enter', {
      rid,
      path: req.originalUrl,
      method: req.method,
      uid: userId,
      uidType: typeof userId,
      id,
      hasToken: Boolean(req.headers?.authorization),
    });

    if (!userId) {
      logT('[transcripts.download] unauthorized', { rid });
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!isUuid(id)) {
      logT('[transcripts.download] invalid_id', { rid, id });
      return res.status(400).json({ error: 'Invalid transcript id' });
    }

    const q = await pool.query(
      `SELECT id, student_id, course_id, url
         FROM transcripts
        WHERE id = $1
        LIMIT 1`,
      [id],
    );

    if (!q.rowCount) {
      logT('[transcripts.download] not_found', { rid, id });
      return res.status(404).json({ error: 'Not found' });
    }

    const tr = q.rows[0];

    // ✅ Numeric-safe owner check (prevents "1850" !== 1850 issues)
    if (Number(tr.student_id) !== Number(userId)) {
      logT('[transcripts.download] forbidden', {
        rid,
        id,
        tr_student_id: tr.student_id,
        uid: userId,
      });
      return res.status(403).json({ error: 'Forbidden' });
    }

    const url = String(tr.url || '').trim();
    if (!url) {
      logT('[transcripts.download] not_ready', {
        rid,
        id,
        reason: 'missing_url',
      });
      return res.status(409).json({
        error: 'TRANSCRIPT_NOT_READY',
        message:
          'Transcript exists but file is not uploaded yet. Please regenerate it.',
      });
    }

    const suggestedFilename = `transcript-${tr.id}.pdf`;

    const streamUrlToClient = async (urlToFetch, note = 'public') => {
      logT('[transcripts.download] streaming', { rid, note, url: '[url]' });

      const upstream = await axios.get(urlToFetch, {
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
        logErr('[transcripts] stream error', e, { rid });
        if (!res.headersSent) {
          res.status(502).end('Failed to fetch transcript file');
        } else {
          res.end();
        }
      });

      upstream.data.pipe(res);
    };

    // 1) Try public URL first
    try {
      await streamUrlToClient(url, 'public');
      logT('[transcripts.download] ok_public', { rid, id });
      return;
    } catch (e) {
      // log non-401 errors loudly
      if (e?.status && e.status !== 401) {
        logErr('[transcripts] download upstream error (non-401)', e, { rid, id });
      } else {
        logT('[transcripts.download] public_failed', {
          rid,
          id,
          status: e?.status,
        });
      }

      // 2) Fall back to signed URLs
      const cfg = cloudinary.config() || {};
      if (!cfg.api_key || !cfg.api_secret) {
        logT('[transcripts.download] missing_cloudinary_creds', {
          rid,
          cloud_name: cfg.cloud_name,
          has_api_key: !!cfg.api_key,
          has_api_secret: !!cfg.api_secret,
        });

        return res.status(502).json({
          error:
            'Cloudinary private download requires API credentials. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and restart the server.',
        });
      }

      const publicId =
        publicIdFromTranscriptUrl(url) || `transcripts/${tr.id}`;

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

      const typesToTry = ['upload', 'authenticated', 'private'];
      for (const t of typesToTry) {
        try {
          await tryPrivateDownload(t);
          logT('[transcripts.download] ok_private', { rid, id, type: t });
          return;
        } catch (e2) {
          if (e2?.status && (e2.status === 401 || e2.status === 404)) {
            logT('[transcripts.download] private_failed_try_next', {
              rid,
              id,
              type: t,
              status: e2?.status,
            });
            continue;
          }
          throw e2;
        }
      }

      // 3) Last resort: signed delivery URL (authenticated), include version when present
      let version;
      try {
        const u = new URL(url);
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
      logT('[transcripts.download] ok_signed_delivery', { rid, id });
      return;
    }
  } catch (err) {
    logErr('[transcripts.download] error', err, { rid });
    const status = (err && err.status) || 500;
    return res
      .status(status)
      .json({ error: err?.message || 'Download failed' });
  }
}

export async function listMyTranscripts(req, res) {
  const meta = reqTag(req);
  try {
    const userId = req.user?.id;
    if (!userId) {
      logInfo('[transcripts.me] unauthorized', meta);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const base = (
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`
    ).replace(/\/+$/, '');

    // Count first (fast “why empty” insight)
    const countQ = await pool.query(
      `SELECT COUNT(*)::int AS n FROM transcripts WHERE student_id = $1`,
      [userId]
    );
    const n = countQ.rows?.[0]?.n ?? 0;

    logInfo('[transcripts.me] start', { ...meta, student_id: userId, count: n });

    const q = await pool.query(
      `
      SELECT t.*,
             c.title AS course_title
        FROM transcripts t
        LEFT JOIN courses c ON c.id = t.course_id
       WHERE t.student_id = $1
       ORDER BY t.created_at DESC NULLS LAST
      `,
      [userId]
    );

    
    const rows = (q.rows || []).map((r) => {
      const hasUrl = Boolean(String(r.url || '').trim());
      return {
        ...r,
        has_url: hasUrl,
        download_url: hasUrl ? `${base}/api/transcripts/${r.id}/download` : null,
      };
    });

    if (!rows.length) {
      // This is the log you want when client says "No transcripts yet."
      logInfo('[transcripts.me] empty', {
        ...meta,
        student_id: userId,
        hint:
          'No rows for this student_id. Likely generation never happened, or student_id mismatch (uuid vs int).',
      });
    } else {
      logInfo('[transcripts.me] ok', {
        ...meta,
        student_id: userId,
        count: rows.length,
        sample: rows.slice(0, 3).map((r) => ({
          id: r.id,
          course_id: r.course_id,
          has_url: Boolean(r.url),
          created_at: r.created_at,
        })),
      });
    }

    return res.json(rows);
  } catch (err) {
    logErr('[transcripts.me] error', err, meta);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
