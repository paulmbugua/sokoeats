// createAiSandboxCourse.js
import pool from '../config/db.js';
import { cacheDeleteByPattern } from '../utils/redisCache.js';


function cleanTitle(raw) { return String(raw || '').replace(/\s+/g, ' ').trim(); }

const SIZE_ALIASES = {
  micro: 'mini',
  short: 'standard',
  standard: 'standard',
  deep_dive: 'deep_dive',
  mini: 'mini',
  extended: 'extended',
  bootcamp: 'bootcamp',
};
const SIZE_VALID = new Set(['mini', 'standard', 'extended', 'deep_dive', 'bootcamp']);

function normalizeSize(input, minutes) {
  const m = input && SIZE_ALIASES[input] ? SIZE_ALIASES[input] : null;
  if (m) return m;
  if (typeof minutes === 'number') {
    if (minutes < 15) return 'mini';
    if (minutes < 45) return 'standard';
    if (minutes < 90) return 'extended';
    if (minutes < 180) return 'deep_dive';
    return 'bootcamp';
  }
  return 'standard';
}

export async function createAiSandboxCourse(req, res) {
  // 🔍 Log what we received from the client (but keep it focused)
  try {
    const userId =
      req.user?.id ||
      req.user_id ||
      req.userId ||
      req.auth?.userId ||
      null;

    const debugPayload = {
      source: 'createAiSandboxCourse',
      userId,
      ip: req.ip,
      ua: req.get('user-agent') || null,
      body: {
        title: req.body?.title,
        courseSize: req.body?.courseSize,
        size: req.body?.size,
        minutes: req.body?.minutes,
        assignmentId: req.body?.assignmentId,
      },
    };

    console.info('[aiSandbox] incoming request', debugPayload);
  } catch (logErr) {
    // never break the handler because of logging
    console.warn('[aiSandbox] logging failed', logErr);
  }

  try {
    const rawTitle = req.body?.title;
    const title = cleanTitle(rawTitle);

    if (!title || title.length < 3) {
      console.warn('[aiSandbox] TITLE_REQUIRED', { rawTitle });
      return res.status(400).json({ error: 'TITLE_REQUIRED' });
    }
    if (title.length > 150) {
      console.warn('[aiSandbox] TITLE_TOO_LONG', { len: title.length });
      return res.status(400).json({ error: 'TITLE_TOO_LONG' });
    }

    const sizeRaw = req.body?.courseSize || req.body?.size;
    const minutes =
      typeof req.body?.minutes === 'number' ? req.body.minutes : undefined;
    const course_size = normalizeSize(sizeRaw, minutes);

    if (!SIZE_VALID.has(course_size)) {
      console.warn('[aiSandbox] INVALID_SIZE', { sizeRaw, normalized: course_size });
      return res.status(400).json({ error: 'INVALID_SIZE' });
    }

    console.info('[aiSandbox] normalized knobs', {
      title,
      sizeRaw,
      course_size,
      minutes,
    });

    // 1) If exists, just return it (and ensure minimal listability fields are present)
    const existing = await pool.query(
      `
      SELECT id, title, description
      FROM courses
      WHERE is_ai_generated = TRUE
        AND LOWER(title) = LOWER($1)
      LIMIT 1
      `,
      [title]
    );

    if (existing.rows.length) {
      const row = existing.rows[0];

      console.info('[aiSandbox] reuse existing course', {
        id: row.id,
        title: row.title,
      });

      // Backfill minimal listable fields if missing
      await pool
        .query(
          `
          UPDATE courses SET
            syllabus = COALESCE(syllabus, '[]'::jsonb),
            total_units = COALESCE(total_units, 1),
            lessons_per_unit = COALESCE(lessons_per_unit, 1),
            total_lessons = COALESCE(total_lessons, 1),
            estimated_hours = COALESCE(estimated_hours, 0.2)
          WHERE id = $1
        `,
          [row.id]
        )
        .catch((e) => {
          console.warn('[aiSandbox] backfill update failed (non-fatal)', {
            id: row.id,
            error: e?.message,
          });
        });

      await cacheDeleteByPattern('ai:topCourses:*');
      await cacheDeleteByPattern('courses:list:*');
      await cacheDeleteByPattern('courses:byId:*');

      return res.status(200).json({
        id: row.id,
        title: row.title,
        description: row.description,
        blurb: row.description,
        is_ai_generated: true,
        source: 'existing',
      });
    }

    // 2) Create new minimal, listable shell
    const desc = `Sandbox course for: ${title}`;
    const insert = await pool.query(
      `
      INSERT INTO courses (
        id, title, description, course_size, is_ai_generated,
        syllabus, total_units, lessons_per_unit, total_lessons, estimated_hours
      )
      VALUES (
        gen_random_uuid(), $1, $2, $3, TRUE,
        '[]'::jsonb, 1, 1, 1, 0.2
      )
      RETURNING id, title, description
    `,
      [title, desc, course_size]
    );

    const row = insert.rows[0];

    console.info('[aiSandbox] created new sandbox course', {
      id: row.id,
      title: row.title,
      course_size,
    });

    await cacheDeleteByPattern('ai:topCourses:*');
    await cacheDeleteByPattern('courses:list:*');
    await cacheDeleteByPattern('courses:byId:*');

    return res.status(201).json({
      id: row.id,
      title: row.title,
      description: row.description,
      blurb: row.description,
      is_ai_generated: true,
      source: 'created',
    });
  } catch (err) {
    if (err?.code === '23505') {
      // Unique race: return the row
      console.warn('[aiSandbox] unique violation, attempting fallback select', {
        title: cleanTitle(req.body?.title),
      });

      const fb = await pool.query(
        `
        SELECT id, title, description
        FROM courses
        WHERE is_ai_generated = TRUE
          AND LOWER(title) = LOWER($1)
        LIMIT 1
      `,
        [cleanTitle(req.body?.title)]
      );

      if (fb.rows.length) {
        const row = fb.rows[0];
        console.info('[aiSandbox] recovered existing after 23505', { id: row.id });
        return res.status(200).json({
          id: row.id,
          title: row.title,
          description: row.description,
          blurb: row.description,
          is_ai_generated: true,
          source: 'existing_after_23505',
        });
      }
    }

    console.error('[aiSandbox] createAiSandboxCourse error', err);
    return res.status(500).json({ error: 'FAILED_CREATE_AI_COURSE' });
  }
}


