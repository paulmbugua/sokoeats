// apps/backend/routes/aiCourseRoutes.js
import express from 'express';
import {
  listTopCourses,
  generateOutline,
  generateLessonSSML,
  generateQuiz,
  gradeQuiz,
  generateCoursePackage,
  clearCourseCache,
  clearTopCoursesCache,
} from '../controllers/aiCourseController.js';

import optionalAuth from '../middleware/optionalAuth.js';
import requireAuth from '../middleware/auth.js'; // your existing requireAuth
import { purchaseAiCourseAccess } from '../controllers/aiCoursePurchaseController.js';
import requireAuthWhenAssignment from '../middleware/requireAuthWhenAssignment.js';
import enforceAssignmentKnobs from '../middleware/enforceAssignmentKnobs.js';
import { enforceAiCourseAccess } from '../middleware/enforceAiCourseAccess.js';

const router = express.Router();

router.get('/courses/top', listTopCourses);

/**
 * Self-serve: optional auth (so req.user exists if token supplied)
 * Assignment flow: still enforces auth + org membership + locked knobs
 */
router.post(
  '/outline',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  generateOutline,
);

router.post(
  '/lesson-ssml',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  generateLessonSSML,
);

router.post(
  '/quiz',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  generateQuiz,
);

router.post(
  '/course-package',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  generateCoursePackage,
);


router.post('/lesson-ssml',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  enforceAiCourseAccess,
  generateLessonSSML
);

router.post('/course-package',
  optionalAuth,
  requireAuthWhenAssignment,
  enforceAssignmentKnobs,
  enforceAiCourseAccess,
  generateCoursePackage
);

/**
 * 🔒 Grade should be auth-required (even for self-serve)
 * (Still allow assignment knobs enforcement when assignmentId is present)
 */
router.post('/grade', requireAuth, enforceAssignmentKnobs, gradeQuiz);
router.post('/courses/:courseId/purchase', requireAuth, purchaseAiCourseAccess);
/**
 * 🔒 Cache clears: recommend locking
 */
router.post('/cache/clear-course', requireAuth, clearCourseCache);
router.post('/cache/clear-top-courses', requireAuth, clearTopCoursesCache);

export default router;
