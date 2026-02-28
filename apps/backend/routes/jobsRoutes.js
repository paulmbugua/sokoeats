// apps/backend/src/routes/jobsRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  addJobPhotos,
  cancelJob,
} from '../controllers/jobsController.js';

const router = express.Router();

router.get('/jobs', authUser, listJobs);
router.post('/jobs', authUser, createJob);
router.get('/jobs/:id', authUser, getJob);
router.patch('/jobs/:id', authUser, updateJob);
router.post('/jobs/:id/photos', authUser, addJobPhotos);
router.post('/jobs/:id/cancel', authUser, cancelJob);

export default router;
