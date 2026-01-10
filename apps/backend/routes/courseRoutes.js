// apps/backend/routes/courseRoutes.js
import express from 'express';
import * as courseController from '../controllers/courseController.js';
import { createAiSandboxCourse } from '../controllers/coursesController.js';
import authUser from '../middleware/authUser.js';
import anyAuth from '../middleware/anyAuth.js';
import { normalizeCourseSize } from '../middleware/normalizeCourseSize.js';
import { listMyUnlockedAiCourses } from '../controllers/courseMineController.js';
// Optional but recommended: protect the AI route specifically
import { aiLimiterStrict, aiKeyFn } from '../middleware/middleware.js';
import { inflightLimiter } from '../middleware/inflightLimiter.js';

const router = express.Router();

/** ---------------------------------------------------------------------------
 *  PUBLIC course lists
 *  --------------------------------------------------------------------------- */
router.get('/', courseController.getCourses);
router.get('/search', courseController.searchCourses);
/** Feature & recommendation endpoints (PUBLIC) — must come BEFORE '/:id' */
router.get('/featured/courses', courseController.getFeaturedCourses);
router.get('/featured/videos', courseController.getFeaturedVideos);
router.get('/recommendations', courseController.getRecommendedCourses);

/** Tutor-scoped lists (accept normal user OR org instructor via anyAuth) */
router.get('/mine', anyAuth, courseController.getMyCourses);

/** Public tutor-scope by id */
router.get('/tutor/:id', courseController.getTutorCourses);

router.get('/mine/unlocked-ai', anyAuth, listMyUnlockedAiCourses);

/** Create (protected; normal tutor OR org instructor) */
router.post('/', anyAuth, courseController.createCourse);

/** ---------------------------------------------------------------------------
 *  AI course helpers (keep BEFORE '/:id')
 *  POST /api/courses/ai-sandbox
 *  --------------------------------------------------------------------------- */
router.post(
  '/ai-sandbox',
  anyAuth, // must be logged in (site or org) to hit AI sandbox
  inflightLimiter({
    keyFn: aiKeyFn,
    max: Number(process.env.AI_MAX_INFLIGHT || 2),
  }),
  aiLimiterStrict,
  normalizeCourseSize,
  createAiSandboxCourse,
);

/** ---------------------------------------------------------------------------
 *  Read/Update/Delete — '/:id' comes AFTER the static routes above
 *  --------------------------------------------------------------------------- */

// Single course fetch is still public
router.get('/:id', courseController.getCourseById);

// Purchase: keep STRICTLY normal user login (tokens live on users table)
router.post('/:id/purchase', authUser, courseController.purchaseCourse);

// Update/delete: allow either site tutor or org instructor (via anyAuth)
router.patch('/:id', anyAuth, courseController.updateCourse);
router.delete('/:id', anyAuth, courseController.deleteCourse);

export default router;
