import express from 'express';
import {
  mpesaFeeInboundWebhook,
  mpesaFeeInboundValidate,
  mpesaFeeInboundConfirm,
  bankFeeInbound,
  listFeeInbound,
  attachFeeInbound,
  getOrgFeeStructurePdf,
  getInstitutionFeeStatement,
  getInstitutionFeeStatementPdf,
} from '../controllers/orgFeesController.js';

import requireAuth from '../middleware/auth.js';
import { requireOrgFeeAccess, requireOrgProTier } from '../middleware/orgAccess.js';

const router = express.Router();

// Main webhook (keep if you want)
router.post('/fees/inbound/mpesa', mpesaFeeInboundWebhook);

// ✅ Daraja RegisterURL endpoints (no "mpesa" in path)
router.post('/fees/inbound/validate', mpesaFeeInboundValidate);
router.post('/fees/inbound/confirm', mpesaFeeInboundConfirm);

// Bank inbound
router.post('/fees/inbound/bank', bankFeeInbound);

// Admin tools
router.get(
  '/orgs/:orgId/fees/inbound',
  requireAuth,
  requireOrgProTier,
  requireOrgFeeAccess,
  listFeeInbound,
);
router.post(
  '/orgs/:orgId/fees/inbound/:id/attach',
  requireAuth,
  requireOrgProTier,
  requireOrgFeeAccess,
  attachFeeInbound,
);

router.get(
  '/orgs/:orgId/fees/structure.pdf',
  requireAuth,
  requireOrgProTier,
  requireOrgFeeAccess,
  getOrgFeeStructurePdf,
);

router.get(
  '/orgs/:orgId/fees/institution-statement',
  requireAuth,
  requireOrgProTier,
  requireOrgFeeAccess,
  getInstitutionFeeStatement,
);

router.get(
  '/orgs/:orgId/fees/institution-statement.pdf',
  requireAuth,
  requireOrgProTier,
  requireOrgFeeAccess,
  getInstitutionFeeStatementPdf,
);

export default router;
