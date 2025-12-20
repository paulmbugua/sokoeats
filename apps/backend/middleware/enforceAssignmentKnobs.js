// apps/backend/middleware/enforceAssignmentKnobs.js
import pool from '../config/db.js';

function parseJSON(v) {
  if (!v) return null;
  try {
    return typeof v === 'object' ? v : JSON.parse(v);
  } catch {
    return null;
  }
}

/**
 * If assignmentId present:
 *  - Ensure the caller is a member of the org for that assignment
 *  - Force courseId + minutes/totalLessons/quizSize from locked_config
 *  - Also propagate passMark/timer defaults if you want to use them later
 */
export default async function enforceAssignmentKnobs(req, res, next) {
  const assignmentId =
    req.body?.assignmentId || req.query?.assignmentId || req.get('x-assignment-id');

  if (!assignmentId) return next();

  // requireAuthWhenAssignment should have run already, but double-check:
  if (!req.user?.id) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const { rows, rowCount } = await pool.query(
      `
      SELECT
        a.org_id,
        a.course_id,
        a.locked_config,
        a.pass_mark,
        a.timer_s,
        o.default_pass_mark,
        o.quiz_time_limit_s
      FROM org_course_assignments a
      JOIN org_memberships m ON m.org_id = a.org_id AND m.user_id = $2
      JOIN organizations  o ON o.id = a.org_id
      WHERE a.id = $1
      LIMIT 1
      `,
      [assignmentId, req.user.id]
    );

    if (!rowCount) {
      // not found or not a member of this org/assignment
      return res.status(403).json({ message: 'Forbidden' });
    }

    const a = rows[0];
    const locked = parseJSON(a.locked_config) || {};

    // 🔒 Always force server truth
    req.body.courseId = String(a.course_id);

    // minutes/targetMinutes (cover both FE naming + controller naming)
    if (typeof locked.minutes === 'number') {
      req.body.minutes = locked.minutes;
      req.body.targetMinutes = locked.minutes; // IMPORTANT
    }

    // lessons
    if (typeof locked.totalLessons === 'number') {
      req.body.totalLessons = locked.totalLessons;
    }

    // quiz size (cover common keys)
    if (typeof locked.quizSize === 'number') {
      req.body.quizSize = locked.quizSize;
      req.body.count = locked.quizSize;
      req.body.numQuestions = locked.quizSize; // IMPORTANT
    }

    // Optional: pass marks & timer if your downstream needs them
    res.locals.assignment = {
      orgId: a.org_id,
      passMark: a.pass_mark ?? a.default_pass_mark ?? 70,
      timerS: a.timer_s ?? a.quiz_time_limit_s ?? 900,
      lockedConfig: locked,
    };

    return next();
  } catch (e) {
    console.error('[enforceAssignmentKnobs] failed', e);
    return res.status(500).json({ message: 'Internal error' });
  }
}
