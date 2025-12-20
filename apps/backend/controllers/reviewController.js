// controllers/reviewController.js
import pool from '../config/db.js';
import {
  reviewValidationSchema, // existing tutor review validator
  starOnlySchema, // NEW: { rating, comment? }
} from '../validators/reviewValidator.js';

/* --------------------- Helpers --------------------- */

async function ownsVideo(studentId, videoId) {
  // classvault_purchases schema: { id, student_id, class_id, purchased_at, ... }
  const { rows } = await pool.query(
    `SELECT 1
       FROM classvault_purchases
      WHERE student_id = $1
        AND class_id   = $2
      LIMIT 1`,
    [studentId, videoId],
  );
  return rows.length > 0;
}

async function enrolledInCourse(client, studentIdInt, courseIdUuid) {
  const { rows } = await client.query(
    `SELECT 1
       FROM enrollments
      WHERE student_id = $1 AND course_id = $2
      LIMIT 1`,
    [studentIdInt, courseIdUuid],
  );
  return rows.length > 0;
}

/* ========== EXISTING: Tutor Reviews ========== */

export const postTutorReview = async (req, res) => {
  try {
    const { tutorId, comment, rating, sessionId } =
      await reviewValidationSchema.validateAsync(req.body, {
        stripUnknown: true,
      });

    const studentId = req.user.id; // integer (from authUser)
    const { rows } = await pool.query(
      `INSERT INTO reviews 
         (tutor_id, student_id, session_id, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [tutorId, studentId, sessionId, rating, comment],
    );

    return res.status(201).json({
      message: 'Review posted successfully.',
      review: rows[0],
    });
  } catch (err) {
    if (err.isJoi) {
      return res
        .status(400)
        .json({ message: 'Validation error.', details: err.details });
    }
    console.error('Error posting tutor review:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getTutorReviews = async (req, res) => {
  try {
    const { tutorId } = req.query;
    if (!tutorId || typeof tutorId !== 'string') {
      return res
        .status(400)
        .json({ message: 'Tutor ID is required to fetch reviews.' });
    }

    const { rows: stats } = await pool.query(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS total_reviews
         FROM reviews
        WHERE tutor_id = $1`,
      [tutorId],
    );
    const avgRating = stats[0].avg_rating ?? 0;
    const totalReviews = stats[0].total_reviews ?? 0;

    const { rows } = await pool.query(
      `SELECT
         r.id, r.session_id, r.rating, r.comment, r.created_at,
         u.id AS student_id, u.name AS student_name
       FROM reviews r
       JOIN users u ON u.id = r.student_id
       WHERE r.tutor_id = $1
       ORDER BY r.created_at DESC`,
      [tutorId],
    );

    const reviews = rows.map((r) => ({
      id: String(r.id),
      tutorId: String(tutorId),
      sessionId: String(r.session_id),
      rating: Number(r.rating),
      comment: r.comment,
      createdAt: r.created_at,
      studentId: String(r.student_id),
      studentName: r.student_name,
    }));

    return res.status(200).json({
      message: 'Reviews fetched successfully.',
      avgRating: Number(avgRating),
      totalReviews: Number(totalReviews),
      reviews,
    });
  } catch (err) {
    console.error('Error fetching tutor reviews:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

/* ========== NEW: Recorded Video Reviews ========== */

export async function postVideoReview(req, res) {
  try {
    const videoIdParam =
      typeof req.params.videoId === 'string' ? Number(req.params.videoId) : NaN;
    if (!Number.isFinite(videoIdParam)) {
      return res.status(400).json({ message: 'Invalid video id.' });
    }
    const videoId = videoIdParam;

    const studentId = Number(req.user?.id);
    if (!Number.isFinite(studentId)) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { rating, comment } = req.body ?? {};
    const ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res
        .status(400)
        .json({ message: 'Rating must be between 1 and 5' });
    }
    const safeComment =
      typeof comment === 'string' ? comment.trim().slice(0, 500) : null;

    // ✅ check ownership via classvault_purchases.class_id
    const hasAccess = await ownsVideo(studentId, videoId);
    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: 'You have not purchased this class.' });
    }

    // Insert (or upsert if you prefer to allow edits)
    const insertSql = `
      INSERT INTO recorded_video_reviews (video_id, student_id, rating, comment, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, video_id, student_id, rating, comment, created_at
    `;
    const { rows } = await pool.query(insertSql, [
      videoId,
      studentId,
      ratingNum,
      safeComment,
    ]);

    return res
      .status(201)
      .json({ message: 'Review posted successfully.', review: rows[0] });
  } catch (err) {
    console.error('Error posting video review:', err);
    // duplicate review protection if you added UNIQUE (video_id, student_id) on recorded_video_reviews
    if (err && err.code === '23505') {
      return res
        .status(409)
        .json({ message: 'You already reviewed this video.' });
    }

    return res.status(500).json({ message: 'Internal server error.' });
  }
}

export async function getVideoReviews(req, res) {
  try {
    const videoIdParam =
      typeof req.params.videoId === 'string' ? Number(req.params.videoId) : NaN;
    if (!Number.isFinite(videoIdParam)) {
      return res.status(400).json({ message: 'Invalid video id.' });
    }
    const videoId = videoIdParam;

    const { rows } = await pool.query(
      `SELECT id, video_id, student_id, rating, comment, created_at
         FROM recorded_video_reviews
        WHERE video_id = $1
        ORDER BY created_at DESC`,
      [videoId],
    );

    return res.status(200).json(rows);
  } catch (err) {
    console.error('Error fetching video reviews:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
}

/* ========== NEW: Course Reviews ========== */

// controllers/reviewController.js (or wherever this lives)
export const postCourseReview = async (req, res) => {
  try {
    // Validate body (rating 1-5, optional comment)
    const { rating, comment } = await starOnlySchema.validateAsync(req.body, {
      stripUnknown: true,
    });

    // IDs in your schema are UUIDs — keep them as strings
    const studentId = String(req.user.id); // UUID string
    const courseId = String(req.params.courseId); // UUID string

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // 1) Ensure the student is enrolled in this course
      const { rows: enr } = await client.query(
        `
        SELECT 1
          FROM public.enrollments
         WHERE student_id = $1
           AND course_id  = $2
         LIMIT 1
        `,
        [studentId, courseId],
      );

      if (enr.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Not enrolled.' });
      }

      // 2) Upsert the review (student can edit their own review)
      await client.query(
        `
        INSERT INTO public.course_reviews (course_id, student_id, rating, comment, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (course_id, student_id)
        DO UPDATE SET
          rating     = EXCLUDED.rating,
          comment    = EXCLUDED.comment,
          created_at = NOW()
        `,
        [courseId, studentId, rating, comment ?? null],
      );

      // 3) Recompute aggregates from source of truth
      const { rows: aggRows } = await client.query(
        `
        WITH agg AS (
          SELECT
            COALESCE(AVG(r.rating), 0)::NUMERIC(3,2) AS avg_rating,
            COUNT(*)::INT                             AS ratings_count
          FROM public.course_reviews r
          WHERE r.course_id = $1
        )
        UPDATE public.courses c
           SET avg_rating    = agg.avg_rating,
               ratings_count = agg.ratings_count
          FROM agg
         WHERE c.id = $1
        RETURNING c.avg_rating, c.ratings_count
        `,
        [courseId],
      );

      await client.query('COMMIT');

      const summary = aggRows[0] ?? { avg_rating: 0, ratings_count: 0 };

      return res.status(201).json({
        message: 'Review saved.',
        avgRating: Number(summary.avg_rating ?? 0),
        ratingsCount: Number(summary.ratings_count ?? 0),
      });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('Error posting course review:', e);
      return res.status(500).json({ message: 'Internal server error.' });
    } finally {
      client.release();
    }
  } catch (err) {
    if (err?.isJoi) {
      return res
        .status(400)
        .json({ message: 'Validation error.', details: err.details });
    }
    console.error('Error validating course review:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};

export const getCourseReviews = async (req, res) => {
  try {
    const courseId = String(req.params.courseId); // UUID

    const { rows: stats } = await pool.query(
      `SELECT AVG(rating) AS avg_rating, COUNT(*) AS total_reviews
         FROM course_reviews
        WHERE course_id = $1`,
      [courseId],
    );
    const avgRating = stats[0].avg_rating ?? 0;
    const totalReviews = stats[0].total_reviews ?? 0;

    const { rows } = await pool.query(
      `SELECT
         r.id, r.rating, r.comment, r.created_at,
         u.id AS student_id, u.name AS student_name
       FROM course_reviews r
       JOIN users u ON u.id = r.student_id
       WHERE r.course_id = $1
       ORDER BY r.created_at DESC`,
      [courseId],
    );

    const reviews = rows.map((r) => ({
      id: String(r.id),
      rating: Number(r.rating),
      comment: r.comment,
      createdAt: r.created_at,
      studentId: String(r.student_id),
      studentName: r.student_name,
    }));

    return res.status(200).json({
      message: 'Reviews fetched successfully.',
      avgRating: Number(avgRating),
      totalReviews: Number(totalReviews),
      reviews,
    });
  } catch (err) {
    console.error('Error fetching course reviews:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
};
