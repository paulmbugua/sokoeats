import pool from '../config/db.js'; // ← use your existing db pool
import {
  manualAwardSchema,
  unlockAchievementSchema,
} from '../validators/achievements.js';

/**
 * Table schema (Option A):
 * CREATE TABLE achievements (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   student_id UUID REFERENCES users(id),
 *   course_id UUID REFERENCES courses(id),
 *   title TEXT,
 *   icon_url TEXT,
 *   earned_at TIMESTAMP DEFAULT now()
 * );
 *
 * Recommended for idempotency:
 *   CREATE UNIQUE INDEX IF NOT EXISTS uniq_achievements_triplet
 *     ON achievements (student_id, course_id, title);
 */

// GET /api/achievements/me
// GET /api/achievements/:studentId
// GET /api/achievements/me or /api/achievements/:studentId
export async function listStudentAchievements(req, res) {
  try {
    let studentId = req.params.studentId ?? req.user?.id;

    // Normalize: convert to string
    if (!studentId) {
      return res.status(400).json({ error: 'Missing studentId.' });
    }
    studentId = String(studentId).trim();

    const { rows } = await pool.query(
      `SELECT a.*, c.title AS course_title
         FROM achievements a
         LEFT JOIN courses c ON c.id = a.course_id
        WHERE a.student_id = $1
        ORDER BY a.earned_at DESC`,
      [studentId],
    );

    res.json(rows);
  } catch (err) {
    console.error('listStudentAchievements error:', err);
    res.status(500).json({ error: 'Failed to fetch achievements' });
  }
}

// POST /api/achievements  { studentId, courseId?, title, iconUrl? }
export async function awardAchievement(req, res) {
  try {
    const { error, value } = manualAwardSchema.validate(req.body);
    if (error)
      return res
        .status(400)
        .json({ error: error.details?.[0]?.message || error.message });

    const { studentId, courseId, title, iconUrl } = value;

    // Idempotent insert based on (student_id, course_id, title)
    // Works best if you also created the unique index mentioned above.
    const upsert = await pool.query(
      `
      INSERT INTO achievements (id, student_id, course_id, title, icon_url, earned_at)
      VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
      ON CONFLICT (student_id, course_id, title)
      DO NOTHING
      RETURNING *;
      `,
      [studentId, courseId ?? null, title, iconUrl ?? null],
    );

    if (upsert.rowCount > 0) {
      return res
        .status(201)
        .json({ created: true, achievement: upsert.rows[0] });
    }

    // If conflict, fetch the existing row to return a consistent payload
    const existing = await pool.query(
      `SELECT * FROM achievements
        WHERE student_id = $1 AND course_id IS NOT DISTINCT FROM $2 AND title = $3
        LIMIT 1`,
      [studentId, courseId ?? null, title],
    );

    return res.json({ created: false, achievement: existing.rows[0] });
  } catch (err) {
    console.error('awardAchievement error:', err);
    res.status(500).json({ error: 'Failed to award achievement' });
  }
}

export async function unlockAchievement(req, res) {
  try {
    const studentId = req.user.id;
    const { error, value } = unlockAchievementSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const { courseId, title, iconUrl } = value;

    // idempotent: avoid duplicate (student_id, course_id, title)
    const existing = await pool.query(
      `SELECT id FROM achievements WHERE student_id = $1 AND course_id = $2 AND title = $3 LIMIT 1`,
      [studentId, courseId, title],
    );
    if (existing.rowCount > 0) {
      const r = await pool.query(`SELECT * FROM achievements WHERE id = $1`, [
        existing.rows[0].id,
      ]);
      return res.json({ created: false, achievement: r.rows[0] });
    }

    const ins = await pool.query(
      `INSERT INTO achievements (id, student_id, course_id, title, icon_url, earned_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now())
       RETURNING *`,
      [studentId, courseId, title, iconUrl ?? null],
    );

    res.status(201).json({ created: true, achievement: ins.rows[0] });
  } catch (err) {
    console.error('unlockAchievement error', err);
    res.status(500).json({ error: 'Failed to unlock achievement' });
  }
}

// DELETE /api/achievements/:id
export async function deleteAchievement(req, res) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;

    // restrict delete to owner
    const check = await pool.query(
      `SELECT 1 FROM achievements WHERE id = $1 AND student_id = $2`,
      [id, studentId],
    );
    if (check.rowCount === 0) {
      return res.status(404).json({ error: 'Achievement not found' });
    }

    await pool.query(`DELETE FROM achievements WHERE id = $1`, [id]);
    res.json({ deleted: true });
  } catch (err) {
    console.error('deleteAchievement error', err);
    res.status(500).json({ error: 'Failed to delete achievement' });
  }
}
