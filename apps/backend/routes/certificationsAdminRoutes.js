import express from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  listCertifications,
  getCertificationById,
  verifyCertification,
} from '../controllers/certificationController.js';

const router = express.Router();

router.get('/', adminAuth, listCertifications);
router.get('/:id', adminAuth, getCertificationById);
router.put('/:profileId/verify', adminAuth, verifyCertification);

export default router;
