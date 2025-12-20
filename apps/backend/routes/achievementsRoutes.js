import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  listStudentAchievements,
  awardAchievement,
  unlockAchievement, // ✅ import it
  deleteAchievement, // ✅ import it
} from '../controllers/achievementsController.js';

const router = express.Router();

/**
 * IMPORTANT: Order matters. Put literal routes before param routes.
 * '/me' and '/unlock' must come before '/:studentId'.
 */

// Current user’s achievements
router.get('/me', authUser, listStudentAchievements);

// Unlock for current user (idempotent)
router.post('/unlock', authUser, unlockAchievement);

// Manual award (tutor/admin only) — idempotent on (student_id, course_id, title)
router.post('/', authUser, awardAchievement);

// Remove one of my achievements (owner-only by default)
router.delete('/:id', authUser, deleteAchievement);

// List by studentId (admin-only or self — enforce in authUser/another middleware)
router.get('/:studentId', authUser, listStudentAchievements);

export default router;
