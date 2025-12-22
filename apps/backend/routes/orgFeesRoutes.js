import express from 'express';
import {
  mpesaFeeInboundWebhook,
  mpesaFeeInboundValidate,
  mpesaFeeInboundConfirm,
  bankFeeInbound,
  listFeeInbound,
  attachFeeInbound,
} from '../controllers/orgFeesController.js';

import requireAuth from '../middleware/auth.js';

const router = express.Router();

// Main webhook (keep if you want)
router.post('/fees/inbound/mpesa', mpesaFeeInboundWebhook);

// ✅ Daraja RegisterURL endpoints (no "mpesa" in path)
router.post('/fees/inbound/validate', mpesaFeeInboundValidate);
router.post('/fees/inbound/confirm', mpesaFeeInboundConfirm);

// Bank inbound
router.post('/fees/inbound/bank', bankFeeInbound);

// Admin tools
router.get('/orgs/:orgId/fees/inbound', requireAuth, listFeeInbound);
router.post('/orgs/:orgId/fees/inbound/:id/attach', requireAuth, attachFeeInbound);

export default router;
