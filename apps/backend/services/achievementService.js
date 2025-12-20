// services/achievementService.js
import pool from '../config/db.js';

export async function awardFirstEnrollment({ studentId, courseId }) {
  const ruleCode = 'COURSE_FIRST_ENROLL';
  const title = 'First Step';
  const iconUrl = 'https://example.com/icons/first-step.png';

  // Is this student’s first enrollment at all?
  const enrollCount = await db.query(
    `SELECT COUNT(*)::int AS c FROM enrollments WHERE student_id = $1`,
    [studentId],
  );

  if (enrollCount.rows[0].c !== 1) return null; // only on the very first enrollment

  const result = await db.query(
    `INSERT INTO achievements (student_id, course_id, rule_code, title, icon_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [studentId, courseId, ruleCode, title, iconUrl],
  );

  return result.rows[0] || null;
}

export async function awardCourseCompletion({ studentId, courseId }) {
  const ruleCode = 'COURSE_COMPLETE';
  const title = 'Course Finisher';
  const iconUrl = 'https://example.com/icons/course-finisher.png';

  // Verify all weeks completed
  const courseRes = await db.query(
    `SELECT syllabus FROM courses WHERE id = $1`,
    [courseId],
  );
  if (!courseRes.rows.length) return null;
  const syllabus = courseRes.rows[0].syllabus || [];
  if (syllabus.length === 0) return null;

  const weeks = syllabus.map((s) => s.week);
  const { rows: progressRows } = await db.query(
    `SELECT week, status
       FROM course_progress
      WHERE student_id = $1 AND course_id = $2`,
    [studentId, courseId],
  );

  // Every week present in progressRows as Completed?
  const completedAll = weeks.every((w) =>
    progressRows.some((p) => p.week === w && p.status === 'Completed'),
  );
  if (!completedAll) return null;

  const result = await db.query(
    `INSERT INTO achievements (student_id, course_id, rule_code, title, icon_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [studentId, courseId, ruleCode, title, iconUrl],
  );

  return result.rows[0] || null;
}
