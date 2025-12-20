// controllers/enrollmentController.js
import pool from '../config/db.js'; // your configured pg Pool
import { v4 as uuidv4 } from 'uuid';
import {
  enrollBodySchema, // validates { course_id }
  studentParamsSchema,
  courseParamsSchema,
  idParamsSchema,
} from '../validators/enrollmentValidators.js';

/**
 * POST /api/enrollments
 * Body: { course_id: uuid }
 * Auth: requires req.user (id + optional role). student_id comes from JWT (req.user.id).
 */
export const createEnrollment = async (req, res) => {
  try {
    console.log('▶ createEnrollment incoming body:', req.body);

    const { error, value } = enrollBodySchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details?.[0]?.message });
    }
    const { course_id } = value;

    if (!req.user?.id) {
      return res
        .status(401)
        .json({ message: 'Unauthorized: missing user context' });
    }
    if (req.user?.role && req.user.role !== 'student') {
      return res.status(403).json({ message: 'Only students can enroll' });
    }

    // 🔎 Check course price; if > 0, force client to run purchase flow
    const { rows: courseRows } = await pool.query(
      `SELECT price FROM courses WHERE id = $1`,
      [course_id],
    );
    if (courseRows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }
    const priceNum = Number(courseRows[0].price ?? 0);
    if (priceNum > 0) {
      // Keep this endpoint for free courses only
      return res.status(402).json({
        message:
          'This is a paid course. Use POST /api/courses/:id/purchase to enroll and trigger tutor payout.',
      });
    }

    // Prevent duplicate enrollments
    const dupCheck = await pool.query(
      `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
      [req.user.id, course_id],
    );
    if (dupCheck.rowCount > 0) {
      return res
        .status(409)
        .json({ message: 'Already enrolled in this course' });
    }

    // Free course enrollment
    const id = uuidv4();
    const result = await pool.query(
      `INSERT INTO enrollments (id, student_id, course_id, status, progress, started_at)
       VALUES ($1, $2, $3, 'active', 0, NOW())
       RETURNING *`,
      [id, req.user.id, course_id],
    );

    console.log('✅ createEnrollment (free) created row:', result.rows[0]);
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('❌ createEnrollment error:', err);
    return res
      .status(500)
      .json({ message: 'Failed to enroll student', error: err.message });
  }
};

/**
 * GET /api/enrollments/student/:studentId
 * Auth: allow owner (student) or admin
 */
export const getEnrollmentsByStudent = async (req, res) => {
  try {
    const { error, value } = studentParamsSchema.validate(req.params);
    if (error)
      return res.status(400).json({ message: error.details?.[0]?.message });

    const rawStudentId = value.studentId;

    // 🔍 Resolve "me" -> req.user.id
    const resolvedStudentId =
      rawStudentId === 'me' ? req.user?.id : rawStudentId;

    // Debug (remove in prod)
    console.log('▶ getEnrollmentsByStudent', {
      rawStudentId,
      resolvedStudentId,
      user: { id: req.user?.id, role: req.user?.role },
    });

    // AuthZ: only owner or admin
    if (
      req.user?.role !== 'admin' &&
      String(req.user?.id) !== String(resolvedStudentId)
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const result = await pool.query(
      `SELECT e.*, c.title, c.description, c.level, c.price
         FROM enrollments e
         JOIN courses c ON e.course_id = c.id
        WHERE e.student_id = $1
        ORDER BY e.started_at DESC`,
      [resolvedStudentId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('❌ getEnrollmentsByStudent error:', err);
    return res
      .status(500)
      .json({ message: 'Failed to fetch enrollments', error: err.message });
  }
};

/**
 * GET /api/enrollments/course/:courseId
 */
export const getEnrollmentsByCourse = async (req, res) => {
  try {
    const { error, value } = courseParamsSchema.validate(req.params);
    if (error)
      return res.status(400).json({ message: error.details?.[0]?.message });

    const { courseId } = value;

    const result = await pool.query(
      `SELECT e.*, u.name AS student_name, u.email AS student_email
         FROM enrollments e
         JOIN users u ON e.student_id = u.id
        WHERE e.course_id = $1
        ORDER BY e.started_at DESC`,
      [courseId],
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('❌ getEnrollmentsByCourse error:', err);
    return res.status(500).json({
      message: 'Failed to fetch course enrollments',
      error: err.message,
    });
  }
};

/**
 * DELETE /api/enrollments/:id
 * (Hard delete. If you prefer soft-cancel, switch to UPDATE status/completed_at.)
 */
export const cancelEnrollment = async (req, res) => {
  try {
    const { error, value } = idParamsSchema.validate(req.params);
    if (error)
      return res.status(400).json({ message: error.details?.[0]?.message });

    const { id } = value;

    await pool.query(`DELETE FROM enrollments WHERE id = $1`, [id]);

    return res.json({ message: 'Enrollment cancelled successfully' });
  } catch (err) {
    console.error('❌ cancelEnrollment error:', err);
    return res
      .status(500)
      .json({ message: 'Failed to cancel enrollment', error: err.message });
  }
};
