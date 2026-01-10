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
import requireAuth from '../middleware/auth.js';
import requireAuthWhenAssignment from '../middleware/requireAuthWhenAssignment.js';
import enforceAssignmentKnobs from '../middleware/enforceAssignmentKnobs.js';
import { enforceAiCourseAccess } from '../middleware/enforceAiCourseAccess.js';

// (optional) alias purchase route to existing unlock handler:
import { unlockNarrationAccess } from '../controllers/certificatesController.js';

const router = express.Router();

router.get('/courses/top', listTopCourses);

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
  enforceAiCourseAccess,
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
  enforceAiCourseAccess,
  generateCoursePackage,
);

// 🔒 Grade should remain auth-required
router.post('/grade', requireAuth, enforceAssignmentKnobs, gradeQuiz);

// ✅ Optional backwards-compatible alias (no new controller):
router.post('/courses/:courseId/purchase', requireAuth, (req, res) => {
  req.body = { ...(req.body || {}), courseId: req.params.courseId };
  return unlockNarrationAccess(req, res);
});

// 🔒 Cache clears
router.post('/cache/clear-course', requireAuth, clearCourseCache);
router.post('/cache/clear-top-courses', requireAuth, clearTopCoursesCache);

export default router;
