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
  declineHandymanJobOffer,
  getHandymanEarnings,
  getHandymanProfile,
  updateHandymanLocation,
  updateHandymanVerificationDocuments,
} from '../controllers/jobsController.js';

const router = express.Router();

router.get('/promotions/first-job', authUser, getFirstJobPromotion);
router.get('/handyman/jobs', authUser, listOpenJobsForHandyman);
router.post('/handyman/jobs/:id/decline', authUser, declineHandymanJobOffer);
router.get('/handyman/earnings', authUser, getHandymanEarnings);
router.get('/handyman/profile', authUser, getHandymanProfile);
router.put('/handyman/profile/location', authUser, updateHandymanLocation);
router.put('/handyman/profile/verification', authUser, express.json(), updateHandymanVerificationDocuments);
router.get('/jobs', authUser, listJobs);
router.post('/jobs', authUser, createJob);
router.get('/jobs/:id', authUser, getJob);
router.patch('/jobs/:id', authUser, updateJob);
router.post('/jobs/:id/photos', authUser, addJobPhotos);
router.post('/jobs/:id/cancel', authUser, cancelJob);
router.delete('/jobs/:id', authUser, cancelJob);

export default router;
