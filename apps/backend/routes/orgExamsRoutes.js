// apps/backend/routes/orgExamsRoutes.js
import { Router } from 'express';
import {
  getOrgExamConfig,
  upsertOrgExamConfig,
  getOrgExamSheet,
  saveOrgExamSheet,
  getOrgExamStudentCard,
  sendOrgExamStudentCardEmail,
  getOrgExamAnalytics,
  getOrgExamStudentCardPdf,
  generateOrgExamStudentAiRemarks,
  saveOrgExamStudentRemarks,
  // ⬇️ class report controller
  getOrgClassReportPdf,
  generateOrgExamSheetAiCompute,
  generateOrgExamSheetFromDocs,
  generateOrgExamConfigAi,
} from '../controllers/orgExamsController.js';

// ⬇️ Use anyAuth (supports both authUser + org auth, plus ?token=)
import anyAuth from '../middleware/anyAuth.js';

const router = Router({ mergeParams: true });

// 🔐 All routes require *either* user auth or org auth via anyAuth
router.use(anyAuth);

// Config (terms / sessions / grading)
router.get('/:orgId/exams/config', getOrgExamConfig);
router.post('/:orgId/exams/config', upsertOrgExamConfig);

// Marks entry
router.get('/:orgId/exams/sheet', getOrgExamSheet);
router.post('/:orgId/exams/sheet', saveOrgExamSheet);

// Student report card
router.get('/:orgId/exams/student/:studentId/card', getOrgExamStudentCard);
router.post(
  '/:orgId/exams/student/:studentId/notify',
  sendOrgExamStudentCardEmail,
);

// Analytics
router.get('/:orgId/exams/analytics', getOrgExamAnalytics);
router.get(
  '/:orgId/exams/student/:studentId/card.pdf',
  getOrgExamStudentCardPdf,
);

// AI + remarks
router.post(
  '/:orgId/exams/student/:studentId/ai-remarks',
  generateOrgExamStudentAiRemarks,
);

router.post(
  '/:orgId/exams/student/:studentId/remarks',
  saveOrgExamStudentRemarks,
);

// AI config helper
router.post('/:orgId/exams/config/ai', generateOrgExamConfigAi);

// Class report PDF (booklet)
router.get(
  '/:orgId/exams/sessions/:sessionId/class-report.pdf',
  getOrgClassReportPdf,
);

// 🔹 AI compute/fill for the marks sheet
router.post('/:orgId/exams/sheet/ai-compute', generateOrgExamSheetAiCompute);

router.post(
  '/:orgId/exams/sheet/ai-extract-doc',
  ...generateOrgExamSheetFromDocs,
);

export default router;
