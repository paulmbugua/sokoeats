// apps/backend/controllers/courseController.js
import pool from '../config/db.js';
import Joi from 'joi';
import { sendNotification } from '../utils/sendNotification.js';
import { initiateB2CPayment } from '../services/mpesaService.js';
import { aiParseCourseSearch } from '../services/aiCourseSearch.js';

/* ===========================
   Joi Schemas
=========================== */
const syllabusItemSchema = Joi.object({
  week: Joi.number().integer().min(1).required(),
  topic: Joi.string().allow('').trim(),
  assignment: Joi.string().allow('').trim(),
  videoUrl: Joi.string().uri().allow('').optional(),
  notesUrl: Joi.string().uri().allow('').optional(),
});

const courseSchema = Joi.object({
  // Body may include tutorId as a fallback if token doesn't provide it
  tutorId: Joi.number().integer().optional(),
  title: Joi.string().min(3).required(),
  description: Joi.string().allow(''),
  level: Joi.string()
    .valid('Beginner', 'Intermediate', 'Advanced', 'All Levels')
    .required(),
  duration: Joi.string().allow(''),
  price: Joi.number().precision(2).min(0).required(),
  syllabus: Joi.array().items(syllabusItemSchema).default([]),
  prerequisites: Joi.string().allow(''),
  // Allow org-only meta coming from the new CreateCourse UI
  orgClassLabel: Joi.string().allow('').optional(),
  orgSubjectKey: Joi.string().allow('').optional(),
}).unknown(false);

const recQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(24).default(6),
  minCount: Joi.number().integer().min(0).max(1000).default(1),
}).unknown(true); // tolerate extra query keys

// Partial update (PATCH-like)
const courseUpdateSchema = courseSchema
  .fork(['title', 'level', 'price'], (s) => s.optional())
  .keys({
    tutorId: Joi.forbidden(), // prevent ownership changes
    syllabus: Joi.array().items(syllabusItemSchema).optional(),
  });

/* ===========================
   Helpers
=========================== */

// ── Auth / flags ─────────────────────────────────────────────
function isAdminReq(req) {
  return String(req?.user?.role || '').toLowerCase() === 'admin';
}
function allowAiInResponse(req) {
  return isAdminReq(req) && String(req.query?.include_ai || '') === '1';
}
function aiExclusionClause(alias = 'c', req) {
  return allowAiInResponse(req)
    ? 'TRUE'
    : `NOT COALESCE(${alias}.is_ai_generated, FALSE)`;
}
function aiOff(alias, req) {
  return aiExclusionClause(alias, req);
}
function hasTutor(alias = 'c') {
  return `EXISTS (SELECT 1 FROM users u WHERE u.id = ${alias}.tutor_id)`;
}

const isUuid = (s) =>
  typeof s === 'string' &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(
    s,
  );

function normalizeSyllabus(input = []) {
  const kept = (Array.isArray(input) ? input : []).filter((w) => {
    const topic = (w.topic ?? '').trim();
    const assignment = (w.assignment ?? '').trim();
    const videoUrl = (w.videoUrl ?? '').trim();
    const notesUrl = (w.notesUrl ?? '').trim();
    return topic || assignment || videoUrl || notesUrl;
  });

  return kept.map((w, i) => ({
    week: i + 1,
    topic: (w.topic ?? '').trim(),
    assignment: (w.assignment ?? '').trim(),
    videoUrl: (w.videoUrl ?? '').trim(),
    notesUrl: (w.notesUrl ?? '').trim(),
  }));
}

function coerceUserId(u) {
  if (typeof u === 'number') return u;
  if (typeof u === 'string' && /^\d+$/.test(u)) return Number(u);
  return null;
}

/**
 * Unified helper: extract a "user id" that should be used
 * as tutor_id from either:
 *   - normal site auth (authUser → req.user.*)
 *   - org auth (requireAuth → e.g. req.orgUser.*)
 */
function getAuthTutorId(req) {
  // From standard user auth (anyAuth hydrates users_id)
  const userCandidate =
    req?.user?.users_id ??
    req?.user?.user_id ??
    req?.user?.userId ??
    req?.user?.id ??
    req?.user?.sub;

  // From org auth (depending on how auth.js populates it)
  const orgCandidate =
    req?.orgUser?.users_id ??
    req?.orgUser?.user_id ??
    req?.orgUser?.id ??
    req?.orgUser?.userId ??
    req?.orgUser?.sub;

  return coerceUserId(userCandidate) ?? coerceUserId(orgCandidate);
}


// small helpers for recommendation query params
function toInt(v, fallback) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function minCountOrDefault(v, dflt = 3) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n >= 0 ? n : dflt;
}

const PLATFORM_FEE = 0.15;
const USD_TO_KES_FALLBACK = 133;

function getEnvNumber(name, fallback) {
  const raw = process.env?.[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function getFxRate(base, quote) {
  if (base === 'USD' && quote === 'KES') {
    return getEnvNumber('USD_TO_KES', USD_TO_KES_FALLBACK);
  }
  return 1;
}

/* ─────────────────────────────────────────────────────────────
   Payment method normalization (fixes CHECK constraint issues)
────────────────────────────────────────────────────────────── */

const PM_CONSTRAINT_NAME = 'transactions_payment_method_check';

async function getAllowedPaymentMethods(client) {
  // Try to read constraint definition and extract quoted literals
  const q = await client.query(
    `
    SELECT pg_get_constraintdef(pc.oid) AS def
      FROM pg_constraint pc
     WHERE pc.conrelid = 'public.transactions'::regclass
       AND pc.conname  = $1
     LIMIT 1
    `,
    [PM_CONSTRAINT_NAME],
  );
  const def = q.rows?.[0]?.def || '';
  // Pull everything inside single quotes '...'
  const out = new Set();
  const re = /'([^']+)'/g;
  let m;
  while ((m = re.exec(def))) out.add(m[1]);
  return Array.from(out); // e.g. ['card','mpesa','stripe','token','free'] or ['Card','M-Pesa','Stripe','Tokens','Manual']
}

function pickAliasFromAllowed(allowed, desiredAliases) {
  // Case-insensitive match, but return the DB’s original casing
  const map = new Map(allowed.map((v) => [v.toLowerCase(), v]));
  for (const a of desiredAliases) {
    const hit = map.get(a.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Decide which payment_method to write for internal/token purchases.
 */
async function resolvePaymentMethodForTokens(client) {
  const allowed = await getAllowedPaymentMethods(client);
  if (!allowed.length) {
    // If table has no constraint (unlikely), fall back
    return process.env.PLATFORM_BALANCE_METHOD || 'Tokens';
  }

  const envMethod = (process.env.PLATFORM_BALANCE_METHOD || '').trim();
  if (envMethod) {
    const envPick = pickAliasFromAllowed(allowed, [envMethod]);
    if (envPick) return envPick;
  }

  const tokenAliases = [
    'token',
    'tokens',
    'wallet',
    'internal',
    'platformbalance',
    'platform balance',
    'credits',
    'credit',
    'coins',
  ];
  const pick = pickAliasFromAllowed(allowed, tokenAliases);
  if (pick) return pick;

  // As a last resort, use the first allowed value
  return allowed[0];
}

/* ===========================
   CRUD Controllers
=========================== */
export const createCourse = async (req, res) => {
  try {
    const { error, value } = courseSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) return res.status(400).json({ error: error.message });

    // Prefer auth-derived tutorId (works for both site + org via anyAuth)
    let tutorId = getAuthTutorId(req);

    // optional fallback from body
    if (!tutorId && typeof value.tutorId === 'number') tutorId = value.tutorId;

    if (!tutorId) {
      return res.status(401).json({
        error: 'Unauthenticated: tutorId missing in token and request body.',
      });
    }

    // Ensure tutor exists (clearer error than FK violation)
    const tutorCheck = await pool.query('SELECT 1 FROM users WHERE id = $1', [
      tutorId,
    ]);
    if (tutorCheck.rowCount === 0) {
      return res.status(400).json({ error: `Tutor ${tutorId} not found` });
    }

    const cleanedSyllabus = normalizeSyllabus(value.syllabus);

    const result = await pool.query(
      `INSERT INTO courses (
         id, tutor_id, title, description, level, duration, price, syllabus, prerequisites
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8
       )
       RETURNING
         id, tutor_id, title, description, level, duration, price, syllabus, prerequisites,
         COALESCE(avg_rating, 0)::float AS avg_rating,
         COALESCE(ratings_count, 0)     AS ratings_count,
         created_at, updated_at`,
      [
        tutorId,
        value.title,
        value.description ?? '',
        value.level,
        value.duration ?? '',
        value.price,
        JSON.stringify(cleanedSyllabus),
        value.prerequisites ?? '',
      ],
    );

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[createCourse] server error', err);
    if (err && err.code === '23503') {
      return res.status(400).json({ error: 'Invalid tutorId (foreign key).' });
    }
    return res
      .status(500)
      .json({ error: err?.message ?? 'Internal server error' });
  }
};

export const getCourses = async (req, res) => {
  try {
    const where = aiExclusionClause('c', req);
    const sql = `
      SELECT
        c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price,
        c.syllabus, c.prerequisites,
        COALESCE(c.avg_rating, 0)::float AS avg_rating,
        COALESCE(c.ratings_count, 0)     AS ratings_count,
        c.created_at, c.updated_at
      FROM courses c
      WHERE ${where} AND ${hasTutor('c')}
      ORDER BY c.created_at DESC
    `;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('[getCourses] server error', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
};

export const getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id))
      return res.status(400).json({ error: 'Invalid course id' });

    const sql = `
      SELECT
        id, tutor_id, title, description, level, duration, price, syllabus, prerequisites,
        COALESCE(avg_rating, 0)::float AS avg_rating,
        COALESCE(ratings_count, 0)     AS ratings_count,
        created_at, updated_at,
        COALESCE(is_ai_generated, FALSE) AS is_ai_generated
      FROM courses
      WHERE id = $1
    `;
    const result = await pool.query(sql, [id]);
    if (!result.rows.length)
      return res.status(404).json({ error: 'Not found' });

    const row = result.rows[0];

// ✅ Allow AI course fetch when user is authenticated (token present)
// Keep AI hidden for anonymous callers.
if (row.is_ai_generated && !allowAiInResponse(req)) {
  const viewerId = getAuthTutorId(req); // works with anyAuthOptional hydration
  if (!viewerId) return res.status(404).json({ error: 'Not found' });
}



    const { is_ai_generated, ...safe } = row;
    res.json(safe);
  } catch (err) {
    console.error('[getCourseById] server error', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
};

export const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id))
      return res.status(400).json({ error: 'Invalid course id' });

    const { error, value } = courseUpdateSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) return res.status(400).json({ error: error.message });

    // Verify existence + ownership
    const found = await pool.query(
      'SELECT id, tutor_id FROM courses WHERE id = $1',
      [id],
    );
    if (found.rowCount === 0)
      return res.status(404).json({ error: 'Not found' });

    const course = found.rows[0];

    const requesterId = getAuthTutorId(req);
    const isAdmin = String(req.user?.role ?? '').toLowerCase() === 'admin';

    if (!isAdmin && requesterId !== course.tutor_id) {
      return res.status(403).json({ error: 'Forbidden: not your course' });
    }

    const fields = [];
    const params = [];
    let idx = 1;

    if (value.title !== undefined) {
      fields.push(`title = $${idx++}`);
      params.push(value.title);
    }
    if (value.description !== undefined) {
      fields.push(`description = $${idx++}`);
      params.push(value.description);
    }
    if (value.level !== undefined) {
      fields.push(`level = $${idx++}`);
      params.push(value.level);
    }
    if (value.duration !== undefined) {
      fields.push(`duration = $${idx++}`);
      params.push(value.duration);
    }
    if (value.price !== undefined) {
      fields.push(`price = $${idx++}`);
      params.push(value.price);
    }
    if (value.prerequisites !== undefined) {
      fields.push(`prerequisites = $${idx++}`);
      params.push(value.prerequisites);
    }
    if (value.syllabus !== undefined) {
      const cleaned = normalizeSyllabus(value.syllabus);
      fields.push(`syllabus = $${idx++}`);
      params.push(JSON.stringify(cleaned));
    }

    if (fields.length === 0) {
      const fresh = await pool.query(
        `SELECT
           id, tutor_id, title, description, level, duration, price, syllabus, prerequisites,
           COALESCE(avg_rating, 0)::float AS avg_rating,
           COALESCE(ratings_count, 0)     AS ratings_count,
           created_at, updated_at
         FROM courses WHERE id = $1`,
        [id],
      );
      return res.json(fresh.rows[0]);
    }

    fields.push(`updated_at = NOW()`);
    const sql = `
      UPDATE courses
      SET ${fields.join(', ')}
      WHERE id = $${idx}
      RETURNING
        id, tutor_id, title, description, level, duration, price, syllabus, prerequisites,
        COALESCE(avg_rating, 0)::float AS avg_rating,
        COALESCE(ratings_count, 0)     AS ratings_count,
        created_at, updated_at
    `;
    params.push(id);

    const updated = await pool.query(sql, params);
    return res.json(updated.rows[0]);
  } catch (err) {
    console.error('[updateCourse] server error', err);
    return res
      .status(500)
      .json({ error: err?.message ?? 'Internal server error' });
  }
};

export const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id))
      return res.status(400).json({ error: 'Invalid course id' });

    const found = await pool.query(
      'SELECT id, tutor_id FROM courses WHERE id = $1',
      [id],
    );
    if (found.rowCount === 0)
      return res.status(404).json({ error: 'Not found' });

    const course = found.rows[0];
    const requesterId = getAuthTutorId(req);
    const isAdmin = String(req.user?.role ?? '').toLowerCase() === 'admin';

    if (!isAdmin && requesterId !== course.tutor_id) {
      return res.status(403).json({ error: 'Forbidden: not your course' });
    }

    await pool.query('DELETE FROM courses WHERE id = $1', [id]);
    return res.status(204).send();
  } catch (err) {
    console.error('[deleteCourse] server error', err);
    return res
      .status(500)
      .json({ error: err?.message ?? 'Internal server error' });
  }
};

export const getMyCourses = async (req, res) => {
  try {
    const tutorId = getAuthTutorId(req);
    if (!tutorId) return res.status(401).json({ error: 'Unauthenticated' });

    const where = aiExclusionClause('c', req);
    const sql = `
      SELECT
        c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price,
        c.syllabus, c.prerequisites,
        COALESCE(c.avg_rating, 0)::float AS avg_rating,
        COALESCE(c.ratings_count, 0)     AS ratings_count,
        c.created_at, c.updated_at
      FROM courses c
      WHERE c.tutor_id = $1 AND ${where} AND ${hasTutor('c')}
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
    `;
    const { rows } = await pool.query(sql, [tutorId]);
    res.json(rows);
  } catch (err) {
    console.error('[getMyCourses] server error', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
};

export const getTutorCourses = async (req, res) => {
  try {
    const { id } = req.params;
    const tutorId = /^\d+$/.test(String(id)) ? Number(id) : null;
    if (!tutorId) return res.status(400).json({ error: 'Invalid tutor id' });

    const where = aiExclusionClause('c', req);
    const sql = `
      SELECT
        c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price,
        c.syllabus, c.prerequisites,
        COALESCE(c.avg_rating, 0)::float AS avg_rating,
        COALESCE(c.ratings_count, 0)     AS ratings_count,
        c.created_at, c.updated_at
      FROM courses c
      WHERE c.tutor_id = $1 AND ${where} AND ${hasTutor('c')}
      ORDER BY c.updated_at DESC NULLS LAST, c.created_at DESC
    `;
    const { rows } = await pool.query(sql, [tutorId]);
    res.json(rows);
  } catch (err) {
    console.error('[getTutorCourses] server error', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
};

/* ===========================
   Recommendations / Featured
=========================== */

export const getFeaturedCourses = async (req, res) => {
  try {
    const limit = toInt(req.query.limit, 8);
    const minCount = minCountOrDefault(req.query.minCount, 3);
    const subject = (req.query.subject ?? '').trim();

    const params = [minCount, limit];
    const where = [
      `COALESCE(c.ratings_count,0) >= $1`,
      aiOff('c', req),
      hasTutor('c'),
    ];

    if (subject) {
      where.push(
        `(LOWER(COALESCE(c.subject, '')) = LOWER($3) OR LOWER(COALESCE(c.category, '')) = LOWER($3))`,
      );
      params.splice(1, 0, subject); // [$1=minCount, $2=subject, $3=limit]
      params.push(limit);
    }

    const sql = `
      SELECT
        c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price, c.syllabus, c.prerequisites,
        COALESCE(c.avg_rating, 0)::float AS avg_rating,
        COALESCE(c.ratings_count, 0)     AS ratings_count,
        c.created_at, c.updated_at
      FROM courses c
      WHERE ${where.join(' AND ')}
      ORDER BY c.avg_rating DESC, c.ratings_count DESC, c.created_at DESC
      LIMIT ${subject ? '$4' : '$2'}
    `;
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('[getFeaturedCourses] server error', err);
    res.status(500).json({ error: err?.message ?? 'Internal server error' });
  }
};

export const getRecommendedCourses = async (req, res) => {
  try {
    const { value, error } = recQuerySchema.validate(req.query, {
      abortEarly: false,
    });
    if (error) return res.status(200).json([]);

    const limit = value.limit;
    const minCount = value.minCount;

    const userId =
      typeof req.user?.id === 'number'
        ? req.user.id
        : typeof req.user?.id === 'string' && /^\d+$/.test(req.user.id)
          ? Number(req.user.id)
          : null;

    if (userId) {
      const sql = `
        WITH my_enroll AS (
          SELECT course_id::uuid AS course_id FROM enrollments WHERE student_id = $3
        )
        SELECT c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price,
               c.syllabus, c.prerequisites, c.created_at, c.updated_at,
               COALESCE(c.avg_rating, 0)::numeric(3,2) AS avg_rating,
               COALESCE(c.ratings_count, 0)::int       AS ratings_count
        FROM courses c
        LEFT JOIN my_enroll me ON me.course_id = c.id
        WHERE COALESCE(c.ratings_count, 0) >= $2
          AND me.course_id IS NULL
          AND ${aiOff('c', req)}
          AND ${hasTutor('c')}
        ORDER BY c.avg_rating DESC NULLS LAST, c.ratings_count DESC, c.created_at DESC
        LIMIT $1;
      `;
      const { rows } = await pool.query(sql, [limit, minCount, userId]);
      return res.json(rows);
    }

    const sql = `
      SELECT id, tutor_id, title, description, level, duration, price,
             syllabus, prerequisites, created_at, updated_at,
             COALESCE(avg_rating, 0)::numeric(3,2) AS avg_rating,
             COALESCE(ratings_count, 0)::int       AS ratings_count
      FROM courses c
      WHERE COALESCE(ratings_count, 0) >= $2
        AND ${aiOff('c', req)}
        AND ${hasTutor('c')}
      ORDER BY avg_rating DESC NULLS LAST, ratings_count DESC, created_at DESC
      LIMIT $1;
    `;
    const { rows } = await pool.query(sql, [limit, minCount]);
    return res.json(rows);
  } catch (err) {
    console.error('[getRecommendedCourses] server error', err);
    return res.status(200).json([]);
  }
};

export const getFeaturedVideos = async (req, res) => {
  try {
    const limit = toInt(req.query.limit, 8);
    const minCount = minCountOrDefault(req.query.minCount, 3);
    const subject = (req.query.subject ?? '').trim();

    const params = [minCount, limit];
    const subjectFilter = subject
      ? "AND LOWER(COALESCE(v.subject, '')) = LOWER($3)"
      : '';
    if (subject) params.splice(1, 0, subject); // [$1=minCount, $2=subject, $3=limit]
    if (subject) params.push(limit);

    const sql = `
      WITH agg AS (
        SELECT
          video_id,
          AVG(rating)::float   AS avg_rating,
          COUNT(*)::int        AS ratings_count
        FROM recorded_video_reviews
        GROUP BY video_id
      )
      SELECT
        v.id, v.tutor_id, v.title, v.description, v.subject, v.grade_level,
        v.price, v.duration, v.tags,
        v.video_url, v.thumbnail_url, v.preview_url,
        v.created_at, v.pdf_url,
        COALESCE(a.avg_rating, 0)::float  AS avg_rating,
        COALESCE(a.ratings_count, 0)::int AS ratings_count
      FROM recorded_videos v
      LEFT JOIN agg a ON a.video_id = v.id
      WHERE COALESCE(a.ratings_count, 0) >= $1
      ${subjectFilter}
      ORDER BY COALESCE(a.avg_rating, 0) DESC,
               COALESCE(a.ratings_count, 0) DESC,
               v.created_at DESC
      LIMIT ${subject ? '$4' : '$2'}
    `;

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error('[getFeaturedVideos] server error', err);
    return res
      .status(500)
      .json({ error: err?.message ?? 'Internal server error' });
  }
};

/* ===========================
   Purchase (Tokens branch)
=========================== */
export const purchaseCourse = async (req, res) => {
  const client = await pool.connect();
  try {
    if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

    const courseId = req.params.id;
    if (!courseId || !/^[0-9a-fA-F-]{36}$/.test(courseId)) {
      return res.status(400).json({ message: 'Invalid course id' });
    }

    // 1) load course
    const { rows: crsRows } = await client.query(
      `
      SELECT id, tutor_id, title, price, COALESCE(is_ai_generated, FALSE) AS is_ai_generated
      FROM courses c
      WHERE id = $1
      `,
      [courseId],
    );
    if (crsRows.length === 0)
      return res.status(404).json({ message: 'Course not found' });
    if (crsRows[0].is_ai_generated && !allowAiInResponse(req)) {
      return res
        .status(400)
        .json({ message: 'This course is not available for purchase.' });
    }

    const { tutor_id: tutorId, title, price: rawPrice } = crsRows[0];
    const priceTokens = Math.round(Number(rawPrice ?? 0));

    await client.query('BEGIN');

    // 2) dup checks BEFORE lock
    const { rows: dupEnroll } = await client.query(
      `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
      [req.user.id, courseId],
    );
    if (dupEnroll.length > 0) {
      await client.query('ROLLBACK');
      const { rows: balRows } = await pool.query(
        `SELECT tokens FROM users WHERE id = $1`,
        [req.user.id],
      );
      return res.status(200).json({
        message: 'Already enrolled',
        purchase: null,
        enrollment: true,
        tokens: Number(balRows[0]?.tokens ?? 0),
      });
    }

    const { rows: dupPurchase } = await client.query(
      `SELECT * FROM course_purchases WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
      [req.user.id, courseId],
    );
    if (dupPurchase.length > 0) {
      const { rows: enrollRows } = await client.query(
        `INSERT INTO enrollments (id, student_id, course_id, status, progress, started_at)
         VALUES (gen_random_uuid(), $1, $2, 'active', 0, NOW())
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [req.user.id, courseId],
      );
      await client.query('COMMIT');
      const { rows: balRows } = await pool.query(
        `SELECT tokens FROM users WHERE id = $1`,
        [req.user.id],
      );
      return res.status(200).json({
        message: 'Already purchased. Enrollment ensured.',
        purchase: dupPurchase[0],
        enrollment: enrollRows[0] ?? null,
        tokens: Number(balRows[0]?.tokens ?? 0),
      });
    }

    // 3) balance check WITH ROW LOCK
    const { rows: userRows } = await client.query(
      `SELECT tokens, name, email FROM users WHERE id = $1 FOR UPDATE`,
      [req.user.id],
    );
    if (!userRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }

    const currentTokens = Number(userRows[0].tokens ?? 0);
    if (currentTokens < priceTokens) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: `Insufficient tokens. Need ${priceTokens - currentTokens} more.`,
      });
    }

    // ======= atomic purchase =======
    await client.query(`UPDATE users SET tokens = tokens - $1 WHERE id = $2`, [
      priceTokens,
      req.user.id,
    ]);

    const netTokens = Math.round(priceTokens * (1 - PLATFORM_FEE));
    const { rows: purchaseRows } = await client.query(
      `INSERT INTO course_purchases (course_id, student_id, tutor_id, gross, net_tokens)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [courseId, req.user.id, tutorId, priceTokens, netTokens],
    );

    const { rows: enrollRows } = await client.query(
      `INSERT INTO enrollments (id, student_id, course_id, status, progress, started_at)
       VALUES (gen_random_uuid(), $1, $2, 'active', 0, NOW())
       RETURNING *`,
      [req.user.id, courseId],
    );

    const { rows: balRows } = await client.query(
      `SELECT tokens FROM users WHERE id = $1`,
      [req.user.id],
    );
    const tokens = Number(balRows[0]?.tokens ?? 0);

    // 4) tutor payout currency + FX
    const { rows: profRows } = await client.query(
      `SELECT COALESCE(payout_currency,'USD') AS payout_currency
         FROM profiles WHERE user_id = $1 AND role='tutor'`,
      [tutorId],
    );
    const payoutCurrency = String(
      profRows[0]?.payout_currency || 'USD',
    ).toUpperCase();

    const grossUsd = +priceTokens.toFixed(2); // 1 token = $1
    const feeUsd = +(grossUsd * PLATFORM_FEE).toFixed(2);
    const netUsd = +(grossUsd - feeUsd).toFixed(2);

    let creditedAmount = netUsd;
    let fxRateUsed = 1;
    if (payoutCurrency === 'KES') {
      fxRateUsed = await getFxRate('USD', 'KES');
      creditedAmount = +(netUsd * fxRateUsed).toFixed(2);
    }

    // 5) accrue to earnings balance
    await client.query(
      `INSERT INTO earnings_balances (user_id, currency, available_amount, pending_amount, updated_at)
       VALUES ($1,$2,$3,0,NOW())
       ON CONFLICT (user_id, currency)
       DO UPDATE SET
         available_amount = earnings_balances.available_amount + EXCLUDED.available_amount,
         updated_at = NOW()`,
      [tutorId, payoutCurrency, creditedAmount],
    );

    // ---------- payment_method that satisfies DB CHECK ----------
    const paymentMethod = await resolvePaymentMethodForTokens(client); // ← dynamic, safe

    // ---------- build INSERT for transactions based on existing columns ----------
    const { rows: txColsRows } = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'transactions'
    `);
    const txCols = new Set(txColsRows.map((r) => r.column_name));

    const cols = [
      'user_id',
      'type',
      'amount',
      'description',
      'date',
      'status',
      'currency',
      'payment_method',
    ];
    const description =
      `Course sale "${title}" · gross ${grossUsd.toFixed(2)} USD ` +
      `(tokens ${priceTokens}), fee ${feeUsd.toFixed(2)} USD, ` +
      `accrued ${creditedAmount} ${payoutCurrency}` +
      (payoutCurrency === 'KES' ? ` @ ${fxRateUsed} FX` : '');

    const vals = [
      tutorId,
      'Completed Earnings',
      creditedAmount,
      description,
      new Date(),
      'Completed',
      payoutCurrency,
      paymentMethod,
    ];

    // Optional columns if present
    if (txCols.has('source')) {
      cols.push('source');
      vals.push('PlatformBalance');
    }
    if (txCols.has('created_at')) {
      cols.push('created_at');
      vals.push(new Date());
    }
    if (txCols.has('updated_at')) {
      cols.push('updated_at');
      vals.push(new Date());
    }
    if (txCols.has('payer_email')) {
      cols.push('payer_email');
      vals.push(null);
    }
    if (txCols.has('payer_id')) {
      cols.push('payer_id');
      vals.push(null);
    }

    const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO transactions (${cols.join(', ')}) VALUES (${placeholders})`;
    await client.query(insertSql, vals);

    await client.query('COMMIT');

    // 7) notify (best effort)
    try {
      const { rows: tutorRows } = await pool.query(
        `SELECT email, name FROM users WHERE id = $1`,
        [tutorId],
      );
      if (tutorRows.length) {
        await sendNotification({
          to: tutorRows[0].email,
          subject: `Earnings accrued for "${title}"`,
          body: `We’ve added ${creditedAmount} ${payoutCurrency} to your available balance (after 15% fee).`,
        });
      }
      await sendNotification({
        to: userRows[0].email,
        subject: `Purchase confirmed: "${title}"`,
        body: `Hi ${userRows[0].name || 'Student'},\n\nYour purchase of "${title}" is confirmed.\nCharged: ${grossUsd} USD (tokens ${priceTokens}). Your updated balance is ${tokens} tokens.\n\nEnjoy!\n— DayBreak`,
      });
    } catch (e) {
      console.warn('[purchaseCourse] notifications failed:', e?.message);
    }

    return res.status(201).json({
      message: 'Purchase successful; earnings accrued.',
      purchase: purchaseRows[0],
      enrollment: enrollRows[0],
      tokens,
      accrual: {
        currency: payoutCurrency,
        creditedAmount,
        grossUSD: grossUsd,
        netUSD: netUsd,
        fxRateUsed,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('❌ purchaseCourse error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    client.release();
  }
};

// apps/backend/controllers/courseController.js

export const searchCourses = async (req, res) => {
  const rid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();

  const dev = process.env.NODE_ENV !== 'production';
  const log = (...args) => dev && console.log(...args);

  try {
    const {
      q = '',
      subject,
      gradeBand, // free-form
      level, // Beginner/Intermediate/Advanced/All Levels
      minRating,
      maxPrice,
      isOer,
      limit: limitStr,
      offset: offsetStr,
    } = req.query;

    const limitN = Math.min(50, Math.max(1, Number(limitStr) || 12));
    const offsetN = Math.max(0, Number(offsetStr) || 0);

    const rawQ = String(q || '').trim();

    // same idea: only use AI for longer multi-word queries
    const shouldUseAi =
      rawQ.length >= 6 && /[a-zA-Z]/.test(rawQ) && /\s/.test(rawQ);

    log(`\n[searchCourses:${rid}] incoming`, {
      rawQ,
      shouldUseAi,
      ui: {
        subject,
        gradeBand,
        level,
        minRating,
        maxPrice,
        isOer,
        limitN,
        offsetN,
      },
    });

    // ── AI parse (optional)
    let ai = null;
    let aiMs = 0;

    if (shouldUseAi) {
      const tAi = Date.now();
      ai = await aiParseCourseSearch(rawQ);
      aiMs = Date.now() - tAi;
      log(`[searchCourses:${rid}] ai parsed (${aiMs}ms)`, ai);
    }

    // effective keywords: if ai used → ai.keywords, else rawQ
    const aiKeywords = (ai?.keywords || '').toString().trim();
    const effectiveKeywords = shouldUseAi && ai ? aiKeywords : rawQ;

    // merge (explicit query params win)
    const merged = {
      keywords: effectiveKeywords,

      subject: (subject || ai?.subject || '').toString().trim(),
      gradeBand: (gradeBand || ai?.gradeBand || '').toString().trim(),
      level: (level || ai?.level || '').toString().trim(),

      minRating: Number(minRating ?? ai?.minRating ?? 0) || 0,
      maxPrice: Number(maxPrice ?? ai?.maxPrice ?? 0) || 0,

      isOer: String(isOer ?? '').length
        ? String(isOer) === 'true' || String(isOer) === '1'
        : Boolean(ai?.isOer),
    };

    if (merged.minRating < 0) merged.minRating = 0;
    if (merged.maxPrice < 0) merged.maxPrice = 0;

    // if OER selected, force price to 0 (your DB may store 0 or NULL; we handle both)
    if (merged.isOer) merged.maxPrice = 0;

    // ────────────────────────────────────────────────────────────────
    // KW decision (prevents gradeBand from killing results)
    // ────────────────────────────────────────────────────────────────
    let kw = String(merged.keywords || '').trim();

    const aiUsed = Boolean(ai);
    const hasStructured =
      Boolean(merged.subject) ||
      Boolean(merged.gradeBand) ||
      Boolean(merged.level) ||
      merged.minRating > 0 ||
      merged.maxPrice > 0 ||
      Boolean(merged.isOer);

    const norm = (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    if (aiUsed && hasStructured && merged.gradeBand) {
      const raw = norm(rawQ);
      const k = norm(kw);
      const gb = norm(merged.gradeBand);
      if (k === raw || k === gb) kw = '';
    }

    log(`[searchCourses:${rid}] merged`, merged);
    log(`[searchCourses:${rid}] kw decision`, {
      rawQ,
      aiUsed,
      gradeBand: merged.gradeBand,
      kwUsed: kw,
    });

    // ────────────────────────────────────────────────────────────────
    // Build SQL
    // ────────────────────────────────────────────────────────────────
    const conditions = [];
    const values = [];
    let idx = 1;

    // keep your “AI exclusion” rule
    conditions.push(aiExclusionClause('c', req));

    // IMPORTANT: course search should allow:
    // - OER courses (often have no tutor)
    // - tutor-uploaded courses (should have tutor)
    // so we gate it like:
    //   if isOer filter is ON → only OER
    //   else → allow either tutor courses OR OER (so mixed results are possible)
    if (merged.isOer) {
      conditions.push(`COALESCE(c.is_oer, FALSE) = TRUE`);
    } else {
      conditions.push(`(${hasTutor('c')} OR COALESCE(c.is_oer, FALSE) = TRUE)`);
    }

    if (merged.subject) {
      conditions.push(`(
        LOWER(COALESCE(c.subject,'')) = LOWER($${idx})
        OR LOWER(COALESCE(c.title,'')) LIKE LOWER($${idx + 1})
        OR LOWER(COALESCE(c.description,'')) LIKE LOWER($${idx + 1})
      )`);
      values.push(merged.subject);
      values.push(`%${merged.subject}%`);
      idx += 2;
    }

    // difficulty level (Beginner/Intermediate/Advanced/All Levels) — optional
    if (merged.level) {
      conditions.push(`LOWER(COALESCE(c.level,'')) = LOWER($${idx++})`);
      values.push(merged.level);
    }

    // gradeBand (free-form): we match across common text fields + size_meta
    // (this lets you support “Grade 3”, “Primary”, “Academy”, etc even without a dedicated column)
    if (merged.gradeBand) {
      conditions.push(`(
        LOWER(COALESCE(c.title,'')) LIKE LOWER($${idx})
        OR LOWER(COALESCE(c.description,'')) LIKE LOWER($${idx})
        OR LOWER(COALESCE(c.level,'')) LIKE LOWER($${idx}) -- some of your rows have blank level; safe
        OR LOWER(COALESCE(c.size_meta::text,'')) LIKE LOWER($${idx})
      )`);
      values.push(`%${merged.gradeBand}%`);
      idx += 1;
    }

    // price (tokens) — only when user asked for a cap AND not OER
    if (!merged.isOer && merged.maxPrice > 0) {
      conditions.push(`COALESCE(c.price, 0) <= $${idx++}`);
      values.push(merged.maxPrice);
    }

    // rating
    if (merged.minRating > 0) {
      conditions.push(`COALESCE(c.avg_rating, 0) >= $${idx++}`);
      values.push(merged.minRating);
    }

    // keyword search
    if (kw) {
      conditions.push(`(
        LOWER(COALESCE(c.title,'')) LIKE $${idx}
        OR LOWER(COALESCE(c.description,'')) LIKE $${idx}
        OR LOWER(COALESCE(c.subject,'')) LIKE $${idx}
      )`);
      values.push(`%${kw.toLowerCase()}%`);
      idx += 1;
    }

    const sql = `
      SELECT
        c.id, c.tutor_id, c.title, c.description, c.level, c.duration, c.price,
        c.syllabus, c.prerequisites,
        c.created_at, c.updated_at,
        COALESCE(c.avg_rating, 0)::float AS avg_rating,
        COALESCE(c.ratings_count, 0)     AS ratings_count,
        COALESCE(c.is_oer, FALSE)        AS is_oer,
        c.subject, c.price_label, c.thumbnail_url,
        c.provider, c.source_kind, c.content_kind,
        c.size_meta
      FROM courses c
      WHERE ${conditions.join(' AND ')}
      ORDER BY
        COALESCE(c.avg_rating, 0) DESC,
        COALESCE(c.ratings_count, 0) DESC,
        c.created_at DESC
      LIMIT $${idx++}
      OFFSET $${idx++};
    `;

    values.push(limitN, offsetN);

    log(`[searchCourses:${rid}] sql`, {
      whereCount: conditions.length,
      paramsCount: values.length,
      limitN,
      offsetN,
      kw,
      sqlPreview: sql.replace(/\s+/g, ' ').trim().slice(0, 260) + '...',
      valuesPreview: values.map((v) =>
        typeof v === 'string' ? (v.length > 80 ? v.slice(0, 80) + '…' : v) : v,
      ),
    });

    const tDb = Date.now();
    const { rows } = await pool.query(sql, values);
    const dbMs = Date.now() - tDb;

    log(`[searchCourses:${rid}] done`, {
      aiUsed,
      aiMs,
      dbMs,
      rows: rows.length,
      totalMs: Date.now() - t0,
    });

    return res.json({
      success: true,
      parsed: ai ? merged : null,
      courses: rows,
      limit: limitN,
      offset: offsetN,
      meta: dev ? { rid, aiMs, dbMs, aiUsed } : undefined,
    });
  } catch (err) {
    console.error(`[searchCourses:${rid}] error`, {
      message: err?.message,
      code: err?.code,
      stack: err?.stack,
      tookMs: Date.now() - t0,
    });
    return res.status(500).json({ message: 'Failed to search courses.', rid });
  }
};
