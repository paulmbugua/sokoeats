// apps/backend/services/courseEnsure.js
import pool from '../config/db.js';
import { cacheDeleteByPattern } from '../utils/redisCache.js';

const SIZE_ALIASES = {
  micro: 'mini',
  short: 'standard',
  standard: 'standard',
  deep_dive: 'deep_dive',
  mini: 'mini',
  extended: 'extended',
  bootcamp: 'bootcamp',
};
const SIZE_VALID = new Set([
  'mini',
  'standard',
  'extended',
  'deep_dive',
  'bootcamp',
]);

function cleanTitle(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSize(input, minutes) {
  if (input && SIZE_ALIASES[input]) return SIZE_ALIASES[input];
  if (typeof minutes === 'number') {
    if (minutes < 15) return 'mini';
    if (minutes < 45) return 'standard';
    if (minutes < 90) return 'extended';
    if (minutes < 180) return 'deep_dive';
    return 'bootcamp';
  }
  return 'standard';
}

/**
 * Ensures there is a row in courses and returns { id, title, description }.
 * - If courseId is given, validates it exists.
 * - Else if title is given, returns existing AI course by title or creates a sandbox course.
 */
export async function ensureCourse({ courseId, title, courseSize, minutes }) {
  if (courseId) {
    const q = await pool.query(
      `SELECT id, title, description FROM courses WHERE id=$1`,
      [courseId],
    );
    if (!q.rowCount) throw new Error('COURSE_NOT_FOUND');
    return q.rows[0];
  }

  const t = cleanTitle(title);
  if (!t || t.length < 3) throw new Error('TITLE_REQUIRED');

  // Try existing (AI-generated) by title
  const existing = await pool.query(
    `SELECT id, title, description
       FROM courses
      WHERE is_ai_generated = TRUE
        AND LOWER(title) = LOWER($1)
      LIMIT 1`,
    [t],
  );
  if (existing.rowCount) return existing.rows[0];

  // Create AI sandbox course
  const size = normalizeSize(courseSize, minutes);
  if (!SIZE_VALID.has(size)) throw new Error('INVALID_SIZE');

  const desc = `AI sandbox course for: ${t}`;
  const ins = await pool.query(
    `INSERT INTO courses (id, title, description, course_size, is_ai_generated)
     VALUES (gen_random_uuid(), $1, $2, $3, TRUE)
     RETURNING id, title, description`,
    [t, desc, size],
  );

  await cacheDeleteByPattern('ai:topCourses:*');

  return ins.rows[0];
}
