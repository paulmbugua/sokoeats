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


import {
  listAttendanceSessions,
  getAttendanceSession,
  createAttendanceSession,
  updateAttendanceSession,
  deleteAttendanceSession,
  upsertAttendanceEntries,
  getAttendanceReport,
  getAttendanceReportCsv,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  getAnnouncementFeed,
  getAnnouncementAgmPdf,
  createSportsEvent,
  updateSportsEvent,
  deleteSportsEvent,
  listSportsEvents,
  createClub,
  updateClub,
  deleteClub,
  listClubs,
  listClubMembers,
  enrollClubMember,
  unenrollClubMember,
  getMyClubs,
  listMessageLogs,
  sendMessageNow,
} from '../controllers/orgEngagementController.js';
import {
  createFeeStructure,
  listFeeStructures,
  updateFeeStructure,
  activateFeeStructure,
  createFeeCharge,
  bulkFeeCharges,
  recordFeePayment,
  getFeeBalances,
  getFeeStatement,
  getFeeStatementPdf,
  getFeeStructurePdf,
  getMyFeeStructure,
  getMyFeeStructurePdf,
  getMyFeeStatement,
  getMyFeeStatementPdf,
} from '../controllers/orgFeesController.js';
import { requireOrgInstructor, requireOrgProTier } from '../middleware/orgAccess.js';

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

// ─────────────────────── Learner self-service fees ───────────────────────
// NOTE: orgRoutes is mounted at /api/orgs, so DO NOT prefix with /api/orgs here.

router.get('/:orgId/fees/learner/structure', requireAuth, getMyFeeStructure);
router.get('/:orgId/fees/learner/structure.pdf', requireAuth, getMyFeeStructurePdf);

router.get('/:orgId/fees/learner/statement', requireAuth, getMyFeeStatement);
router.get('/:orgId/fees/learner/statement.pdf', requireAuth, getMyFeeStatementPdf);


/* ─────────────────────── Pro/Enterprise org tools ─────────────────────── */
router.get(
  '/:orgId/attendance/sessions',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  listAttendanceSessions,
);
router.get(
  '/:orgId/attendance/sessions/:sessionId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getAttendanceSession,
);
router.post(
  '/:orgId/attendance/sessions',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  createAttendanceSession,
);
router.put(
  '/:orgId/attendance/sessions/:sessionId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  updateAttendanceSession,
);
router.delete(
  '/:orgId/attendance/sessions/:sessionId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  deleteAttendanceSession,
);
router.post(
  '/:orgId/attendance/sessions/:sessionId/entries',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  upsertAttendanceEntries,
);
router.post(
  '/:orgId/attendance/entries',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  upsertAttendanceEntries,
);
router.get(
  '/:orgId/attendance/report',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getAttendanceReport,
);
router.get(
  '/:orgId/attendance/report.csv',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getAttendanceReportCsv,
);

router.get(
  '/:orgId/fees/structures',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  listFeeStructures,
);
router.post(
  '/:orgId/fees/structures',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  createFeeStructure,
);
router.put(
  '/:orgId/fees/structures/:structureId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  updateFeeStructure,
);
router.post(
  '/:orgId/fees/structures/:structureId/activate',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  activateFeeStructure,
);
router.get(
  '/:orgId/fees/structures/:structureId.pdf',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getFeeStructurePdf,
);

router.post('/:orgId/fees/charges', requireAuth, requireOrgProTier, requireOrgInstructor, createFeeCharge);
router.post(
  '/:orgId/fees/charges/bulk',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  bulkFeeCharges,
);
router.post(
  '/:orgId/fees/payments',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  recordFeePayment,
);
router.get(
  '/:orgId/fees/balances',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getFeeBalances,
);
router.get(
  '/:orgId/fees/learners/:learnerId/statement',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getFeeStatement,
);
router.get(
  '/:orgId/fees/learners/:learnerId/statement.pdf',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  getFeeStatementPdf,
);



router.get('/:orgId/announcements/feed', requireAuth, requireOrgProTier, getAnnouncementFeed);
router.get('/:orgId/announcements/:announcementId/agm.pdf', requireAuth, requireOrgProTier, getAnnouncementAgmPdf);
router.get('/:orgId/announcements', requireAuth, requireOrgProTier, listAnnouncements);
router.post(
  '/:orgId/announcements',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  createAnnouncement,
);
router.put(
  '/:orgId/announcements/:announcementId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  updateAnnouncement,
);
router.delete(
  '/:orgId/announcements/:announcementId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  deleteAnnouncement,
);

router.get('/:orgId/sports/events.csv', (req, res, next) => {
  req.query.format = 'csv';
  return next();
});
router.get('/:orgId/sports/events', requireAuth, requireOrgProTier, listSportsEvents);
router.post('/:orgId/sports/events', requireAuth, requireOrgProTier, requireOrgInstructor, createSportsEvent);
router.put(
  '/:orgId/sports/events/:eventId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  updateSportsEvent,
);
router.delete(
  '/:orgId/sports/events/:eventId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  deleteSportsEvent,
);

router.get('/:orgId/clubs', requireAuth, requireOrgProTier, listClubs);
router.get('/:orgId/clubs/mine', requireAuth, requireOrgProTier, getMyClubs);
router.post('/:orgId/clubs', requireAuth, requireOrgProTier, requireOrgInstructor, createClub);
router.put(
  '/:orgId/clubs/:clubId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  updateClub,
);
router.delete(
  '/:orgId/clubs/:clubId',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  deleteClub,
);
router.get(
  '/:orgId/clubs/:clubId/members',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  listClubMembers,
);
router.post(
  '/:orgId/clubs/:clubId/enroll',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  enrollClubMember,
);
router.post(
  '/:orgId/clubs/:clubId/unenroll',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  unenrollClubMember,
);

router.get(
  '/:orgId/messages/log',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  listMessageLogs,
);
router.post(
  '/:orgId/messages/send-now',
  requireAuth,
  requireOrgProTier,
  requireOrgInstructor,
  sendMessageNow,
);

router.post('/:orgId/reports/test-send', requireAuth, (_req, res) =>
  res.json({ ok: true }),
);
router.post('/:orgId/reports/send', requireAuth, (_req, res) =>
  res.json({ ok: true }),
);

export default router;
