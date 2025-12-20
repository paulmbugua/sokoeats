import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  getProgress,
  updateProgress,
  getProgressSummary,
} from '../controllers/courseProgressController.js';
import { ensureWeekWatched } from '../controllers/progressWatchController.js';

const router = express.Router();

// Normalize body so ensureWeekWatched can read courseId from params
const requireWatchedBeforeComplete = (req, res, next) => {
  const status = String(req.body?.status || '');
  if (status !== 'Completed') return next();
  req.body = { ...req.body, courseId: req.params.courseId };
  return ensureWeekWatched(req, res, next);
};

router.get('/:courseId', authUser, getProgress);
// ⬇️ add the guard *before* updateProgress
router.post(
  '/:courseId',
  authUser,
  requireWatchedBeforeComplete,
  updateProgress,
);
router.get('/:courseId/summary', authUser, getProgressSummary);

export default router;
