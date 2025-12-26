// apps/backend/routes/certificateRoutes.js
import express from 'express';
import anyAuth from '../middleware/anyAuth.js';
import {
  checkEligibility,
  listMyCertificates,
  generateCertificate,
  getCertificate,
  verifyCertificate,
  ogPreview,
  downloadCertificate, // ⬅️ add this import
  getStatus,
  listMyAiCourses,
} from '../controllers/certificatesController.js';

const router = express.Router();
const UUID_RE =
  '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
// ---- Public (no auth) ----
router.get(`/verify/:id(${UUID_RE})`, verifyCertificate);
router.get(`/:id(${UUID_RE})/og`, ogPreview);

// ---- Private (auth) ----
// IMPORTANT: put this BEFORE '/:id'
router.get(`/:id(${UUID_RE})/download`, anyAuth, downloadCertificate);

router.get('/status', anyAuth, getStatus);
router.get('/my-ai-courses', anyAuth, listMyAiCourses);

router.get('/eligibility/:courseId', anyAuth, checkEligibility);
router.get('/me', anyAuth, listMyCertificates);
router.get(`/:id(${UUID_RE})`, anyAuth, getCertificate);
router.post('/generate', anyAuth, generateCertificate);

export default router;
