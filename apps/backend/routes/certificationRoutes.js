import express from 'express';
import upload from '../middleware/multer.js';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  submitCertification,
  verifyCertification,
  getCertificationStatus,
} from '../controllers/certificationController.js';

const router = express.Router();

// Route for tutors to submit their certification documents (supports multiple files)
router.post(
  '/:profileId/certification',
  upload.array('certification'),
  submitCertification,
);

// Route for admin to verify the certification (uses `PUT` instead of `POST` for better RESTful practice)
router.put('/:profileId/certification/verify', adminAuth, verifyCertification);

// Route to GET certification status for a tutor
router.get('/:profileId/certification/status', getCertificationStatus);

export default router;
