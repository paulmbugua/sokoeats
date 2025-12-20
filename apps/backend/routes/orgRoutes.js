// apps/backend/routes/orgRoutes.js
import express from 'express';
import multer from 'multer';

import requireAuth from '../middleware/auth.js';
import { getOrgPricing } from '../controllers/orgPricingController.js';
import {
  initOrgSubscription,
  confirmOrgSubscription,
} from '../controllers/orgBillingController.js';

import {
  updateOrgBranding,
  createAssignment,
  resolveInvite,
  acceptInvite,
  submitAttempt,
  orgAnalytics,
  getMyOrg,
  getOrgUsage,
  bootstrapMyOrg,
  ensureShareableAssignment,
  getOrgLearnersProgress,
  getAttemptMeta,
  removeOrgMember,
  getOrgRoster,
  createOrgInvite,
  acceptOrgMembershipInvite,
  getMyAttemptForAssignment,
  startAttempt,
  setClassTeacherSignature,
} from '../controllers/orgController.js';

// ⬇️ NEW: learner controllers
import {
  createOrgLearner,
  bulkCreateOrgLearnersCsv,
  setOrgLearnerPhotoByAdmission,
  saveOrgLearnerAttendance,
} from '../controllers/orgLearnersController.js';

import {
  createOrgInstructor,
  bulkCreateOrgInstructorsCsv,
} from '../controllers/orgInstructorsController.js';

import {
  createOrgLegacyAssignment,
  getOrgAssignments,
  submitOrgLegacyAssignment,
  getOrgAssignmentSubmissions,
} from '../controllers/orgLegacyAssignmentsController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

/* ───────────────────────── Mine + usage ───────────────────────── */

router.get('/mine', requireAuth, getMyOrg);
router.get('/:orgId/usage', requireAuth, getOrgUsage);
router.get('/:orgId/learners/progress', requireAuth, getOrgLearnersProgress);
router.get('/:orgId/roster', requireAuth, getOrgRoster);
router.post('/:orgId/invites', requireAuth, createOrgInvite);
router.post('/accept-membership', requireAuth, acceptOrgMembershipInvite);

/* ───────────── Assignment / attempt read APIs (non-:orgId first) ───────────── */

router.get('/attempts/:attemptId/meta', requireAuth, getAttemptMeta);
router.get(
  '/assignments/:assignmentId/mine',
  requireAuth,
  getMyAttemptForAssignment,
);

/* ───────────────────── Branding / assignments / analytics ─────────────────── */

router.put('/:orgId/branding', requireAuth, updateOrgBranding);

// keep legacy create endpoint but now it's idempotent (UPSERT)
router.post('/:orgId/assignments', requireAuth, createAssignment);

// idempotent “one-button share”
router.post('/:orgId/share', requireAuth, ensureShareableAssignment);

router.get('/invite/:code', resolveInvite);
router.post('/accept-assignment', requireAuth, acceptInvite);

// start attempt
router.post('/attempts/start', requireAuth, startAttempt);

// submit attempt (support both spellings)
router.post('/attempt/submit', requireAuth, submitAttempt);
router.post('/attempts/submit', requireAuth, submitAttempt);

router.get('/:orgId/analytics', requireAuth, orgAnalytics);
router.delete('/:orgId/members/:userId', requireAuth, removeOrgMember);

/* ───────────────────────── NEW: learner management ────────────────────────── */
/**
 * NOTE: Do NOT prefix with /api/orgs here.
 * This router is usually mounted at /api/orgs in your main app:
 *   app.use('/api/orgs', orgRoutes);
 */

router.post('/:orgId/learners', requireAuth, createOrgLearner);

router.post(
  '/:orgId/learners/csv',
  requireAuth,
  upload.single('file'),
  bulkCreateOrgLearnersCsv,
);

/**
 * NEW: map learner photos by admission code.
 * Supports either:
 *  - JSON body: { admission_code, photo_url }
 *  - multipart/form-data: admission_code + file=<image>
 */
router.post(
  '/:orgId/learners/photo-by-admission',
  requireAuth,
  upload.single('file'),
  setOrgLearnerPhotoByAdmission,
);

router.post(
  '/:orgId/learners/:studentId/attendance',
  requireAuth,
  saveOrgLearnerAttendance,
);
/* ───────────────────────── NEW: instructor management ────────────────────── */

router.post('/:orgId/instructors', requireAuth, createOrgInstructor);

router.post(
  '/:orgId/instructors/csv',
  requireAuth,
  upload.single('file'),
  bulkCreateOrgInstructorsCsv,
);

// List assignments (learner/admin)
router.get('/:orgId/assignments', requireAuth, getOrgAssignments);

// e.g. in org routes
router.put(
  '/:orgId/classes/:classLabel/class-teacher-signature',
  requireAuth,
  setClassTeacherSignature,
);

// Create classic / legacy assignment
router.post(
  '/:orgId/assignments/legacy',
  requireAuth,
  createOrgLegacyAssignment,
);

// Submit learner work for a legacy assignment
router.post(
  '/:orgId/assignments/:assignmentId/legacy/submit',
  requireAuth,
  submitOrgLegacyAssignment,
);

router.get(
  '/:orgId/assignments/:assignmentId/submissions',
  requireAuth,
  getOrgAssignmentSubmissions,
);

// Public: portal needs this before login sometimes
router.get('/pricing', getOrgPricing);

/* ─────────────────────── Bootstrap + billing + misc ──────────────────────── */

router.post('/bootstrap', requireAuth, bootstrapMyOrg);
router.post('/:orgId/subscribe/init', requireAuth, initOrgSubscription);
router.post(
  '/subscriptions/:paymentId/confirm',
  requireAuth,
  confirmOrgSubscription,
);

// optional stubs
router.post('/:orgId/upgrade', requireAuth, async (req, res) => {
  const { orgId } = req.params;
  const { tier } = req.body || {};
  if (!['starter', 'pro', 'enterprise'].includes(tier)) {
    return res.status(400).json({ message: 'Invalid tier' });
  }
  await req.app
    .get('pool')
    ?.query?.('DO $$ BEGIN END $$;')
    .catch(() => {});
  res.json({
    tier,
    seats: tier === 'starter' ? 50 : tier === 'pro' ? 500 : 5000,
  });
});

router.post('/:orgId/reports/test-send', requireAuth, (_req, res) =>
  res.json({ ok: true }),
);
router.post('/:orgId/reports/send', requireAuth, (_req, res) =>
  res.json({ ok: true }),
);

export default router;
