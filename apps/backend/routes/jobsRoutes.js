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
  getFirstJobPromotion,
  listOpenJobsForHandyman,
  getHandymanProfile,
  updateHandymanLocation,
} from '../controllers/jobsController.js';

const router = express.Router();

router.get('/promotions/first-job', authUser, getFirstJobPromotion);
router.get('/handyman/jobs', authUser, listOpenJobsForHandyman);
router.get('/handyman/profile', authUser, getHandymanProfile);
router.put('/handyman/profile/location', authUser, updateHandymanLocation);
router.get('/jobs', authUser, listJobs);
router.post('/jobs', authUser, createJob);
router.get('/jobs/:id', authUser, getJob);
router.patch('/jobs/:id', authUser, updateJob);
router.post('/jobs/:id/photos', authUser, addJobPhotos);
router.post('/jobs/:id/cancel', authUser, cancelJob);

export default router;
