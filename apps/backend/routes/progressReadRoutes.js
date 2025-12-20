import { Router } from 'express';
import authUser from '../middleware/authUser.js';
import {
  postReadEvent,
  getReadSummary,
  getWeekReadRequirements,
} from '../controllers/progressReadController.js';

const r = Router();
r.post('/progress/read', authUser, postReadEvent);
r.get('/progress/read/:courseId', authUser, getReadSummary);
r.get(
  '/courses/:courseId/weeks/:week/read-reqs',
  authUser,
  getWeekReadRequirements,
);
export default r;
