// apps/backend/routes/courseRoutes.js
import express from 'express';
import * as courseController from '../controllers/courseController.js';
import { createAiSandboxCourse } from '../controllers/coursesController.js';
import requireTutorProfile from '../middleware/requireTutorProfile.js';
import authUser from '../middleware/authUser.js';
import anyAuth from '../middleware/anyAuth.js';
import anyAuthOptional from '../middleware/anyAuthOptional.js';

import { normalizeCourseSize } from '../middleware/normalizeCourseSize.js';
import { listMyUnlockedAiCourses } from '../controllers/courseMineController.js';
import { aiLimiterStrict, aiKeyFn } from '../middleware/middleware.js';
import { inflightLimiter } from '../middleware/inflightLimiter.js';

const router = express.Router();

/** PUBLIC */
router.get('/', courseController.getCourses);
router.get('/explore', courseController.getExploreCourses);
router.get('/search', courseController.searchCourses);
router.get('/featured/courses', courseController.getFeaturedCourses);
router.get('/featured/videos', courseController.getFeaturedVideos);

// ✅ Optional auth so backend can personalize recommendations when token exists
router.get('/recommendations', anyAuthOptional, courseController.getRecommendedCourses);

/** Tutor-scoped lists */
router.get('/mine', anyAuth, courseController.getMyCourses);
router.get('/tutor/:id', courseController.getTutorCourses);
router.get('/mine/unlocked-ai', anyAuth, listMyUnlockedAiCourses);

/** Create */
router.post('/', anyAuth, requireTutorProfile, courseController.createCourse);
/** AI sandbox */
router.post(
  '/ai-sandbox',
  anyAuth,
  inflightLimiter({
    keyFn: aiKeyFn,
    max: Number(process.env.AI_MAX_INFLIGHT || 2),
  }),
  aiLimiterStrict,
  normalizeCourseSize,
  createAiSandboxCourse,
);

/** ✅ Single course fetch */
router.get('/:id', anyAuthOptional, courseController.getCourseById);

/** Purchase */
router.post('/:id/purchase', authUser, courseController.purchaseCourse);

/** Update / delete */
router.patch('/:id', anyAuth, requireTutorProfile, courseController.updateCourse);
router.delete('/:id', anyAuth, requireTutorProfile, courseController.deleteCourse);

export default router;
