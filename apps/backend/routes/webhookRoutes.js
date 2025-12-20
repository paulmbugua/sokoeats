import express from 'express';
import {
  handlePaystackWebhook,
  handleZoomWebhook,
  testOrgWebhook,
  getWebhookSecretMeta,
  createOrRotateWebhookSecret,
} from '../controllers/webhookController.js';
import requireAuth from '../middleware/auth.js';

const router = express.Router();

/**
 * ✅ Webhook Routes
 * - Paystack webhook requires JSON body parsing
 * - Zoom webhook may need additional security validations
 */

router.post('/orgs/:orgId/webhooks/test', requireAuth, testOrgWebhook);
// Paystack Webhook (Ensure it processes JSON data)
router.post('/webhook/paystack', express.json(), handlePaystackWebhook);

// Zoom Webhook (Security improvements recommended)
router.post('/webhook/zoom', express.json(), handleZoomWebhook);

router.get('/orgs/:orgId/webhooks/secret', requireAuth, getWebhookSecretMeta);
router.post(
  '/orgs/:orgId/webhooks/secret',
  requireAuth,
  createOrRotateWebhookSecret,
);

export default router;
