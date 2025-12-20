// apps/backend/controllers/courseProgressController.js
import pool from '../config/db.js';
import { upsertProgressSchema } from '../validators/progress.js';

/** Helper: idempotent award */
async function ensureAchievement({ studentId, courseId, ruleCode }) {
  // Only award if rule is active
  const r = await pool.query(
    `SELECT title, icon_url FROM badge_rules WHERE code = $1 AND active = TRUE LIMIT 1`,
    [ruleCode],
  );
  const title = r.rows[0]?.title ?? ruleCode.replace(/_/g, ' ');
  const iconUrl = r.rows[0]?.icon_url ?? null;

  await pool.query(
    `INSERT INTO achievements (id, student_id, course_id, rule_code, title, icon_url, earned_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, now())
     ON CONFLICT (student_id, course_id, rule_code) DO NOTHING`,
    [studentId, courseId, ruleCode, title, iconUrl],
  );
}

/** Helper: count syllabus weeks (prefers courses.syllabus jsonb; falls back to max week seen) */
async function getSyllabusWeeksCount(courseId, studentId) {
  // Try courses.syllabus JSONB length
  const c = await pool.query(
    `SELECT COALESCE(jsonb_array_length(syllabus), 0) AS total FROM courses WHERE id = $1`,
    [courseId],
  );
  const total = Number(c.rows?.[0]?.total || 0);
  if (total > 0) return total;

  // Fallback: use max week number that appears in progress for this course/student
  const m = await pool.query(
    `SELECT COALESCE(MAX(week), 0) AS max_week
       FROM course_progress
      WHERE course_id = $1 AND student_id = $2`,
    [courseId, studentId],
  );
  return Number(m.rows?.[0]?.max_week || 0);
}

async function getCompletedWeeksCount(studentId, courseId) {
  const q = await pool.query(
    `SELECT COUNT(*)::int AS cnt
       FROM course_progress
      WHERE student_id = $1 AND course_id = $2 AND status = 'Completed'`,
    [studentId, courseId],
  );
  return Number(q.rows?.[0]?.cnt || 0);
}

// GET /api/course-progress/:courseId
export async function getProgress(req, res) {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;
    const result = await pool.query(
      `SELECT week, status, updated_at
         FROM course_progress
        WHERE student_id = $1 AND course_id = $2
     ORDER BY week ASC`,
      [studentId, courseId],
    );
    res.json(result.rows);
  } catch (err) {
    console.error('getProgress error', err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
}

// POST /api/course-progress/:courseId
export async function updateProgress(req, res) {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;

    const { error, value } = upsertProgressSchema.validate(req.body, {
      stripUnknown: true,
    });
    if (error) return res.status(400).json({ error: error.message });

    const { week, status } = value;

    // Upsert progress
    const upsert = await pool.query(
      `
      INSERT INTO course_progress (student_id, course_id, week, status, updated_at)
      VALUES ($1, $2, $3, $4, now())
      ON CONFLICT (student_id, course_id, week)
      DO UPDATE SET status = EXCLUDED.status,
                    updated_at = now()
      RETURNING week, status, updated_at
      `,
      [studentId, courseId, week, status],
    );
    const updated = upsert.rows[0];

    // ---------- Achievement rules ----------
    // 1) COURSE_STARTED
    if (status === 'In Progress') {
      const anyBefore = await pool.query(
        `SELECT 1 FROM course_progress
          WHERE student_id = $1 AND course_id = $2
            AND status IN ('In Progress','Completed')
          LIMIT 1`,
        [studentId, courseId],
      );
      if (anyBefore.rowCount === 0) {
        await ensureAchievement({
          studentId,
          courseId,
          ruleCode: 'COURSE_STARTED',
          title: 'Course started',
          iconUrl: null,
        });
      }
    }

    // 2) FIRST_WEEK_DONE
    if (status === 'Completed') {
      const anyCompletedBefore = await pool.query(
        `SELECT 1 FROM course_progress
          WHERE student_id = $1 AND course_id = $2 AND status = 'Completed'
          LIMIT 1`,
        [studentId, courseId],
      );
      if (anyCompletedBefore.rowCount === 0) {
        await ensureAchievement({
          studentId,
          courseId,
          ruleCode: 'FIRST_WEEK_DONE',
          title: 'First week completed',
          iconUrl: null,
        });
      }
    }

    // 3) HALFWAY_THERE / 4) COURSE_COMPLETED
    const [completed, total] = await Promise.all([
      getCompletedWeeksCount(studentId, courseId),
      getSyllabusWeeksCount(courseId, studentId),
    ]);

    if (total > 0) {
      if (completed >= Math.ceil(total / 2)) {
        await ensureAchievement({
          studentId,
          courseId,
          ruleCode: 'HALFWAY_THERE',
          title: 'Halfway there',
          iconUrl: null,
        });
      }
      if (completed >= total) {
        await ensureAchievement({
          studentId,
          courseId,
          ruleCode: 'COURSE_COMPLETED',
          title: 'Course completed',
          iconUrl: null,
        });
      }
    }
    // --------------------------------------

    res.json({ updated });
  } catch (err) {
    console.error('updateProgress error', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
}

// GET /api/course-progress/:courseId/summary
export async function getProgressSummary(req, res) {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;

    const result = await pool.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
        COUNT(*) FILTER (WHERE status = 'In Progress')::int AS in_progress,
        COUNT(*) FILTER (WHERE status = 'Not Started')::int AS not_started,
        MAX(updated_at) AS last_updated
      FROM course_progress
      WHERE student_id = $1 AND course_id = $2
      `,
      [studentId, courseId],
    );

    const row = result.rows[0];
    res.json({
      courseId,
      completed: Number(row.completed || 0),
      inProgress: Number(row.in_progress || 0),
      notStarted: Number(row.not_started || 0),
      lastUpdated: row.last_updated,
    });
  } catch (err) {
    console.error('getProgressSummary error', err);
    res.status(500).json({ error: 'Failed to fetch progress summary' });
  }
}
