// apps/backend/routes/progressWatchRoutes.js
import { Router } from 'express';
import authUser from '../middleware/authUser.js';
import {
  postWatchEvent,
  getWatchSummary,
  getWeekRequirements,
} from '../controllers/progressWatchController.js';

const r = Router();
r.post('/progress/watch', authUser, postWatchEvent);
r.get('/progress/watch/:courseId', authUser, getWatchSummary);
r.get(
  '/courses/:courseId/weeks/:week/requirements',
  authUser,
  getWeekRequirements,
);
export default r;
