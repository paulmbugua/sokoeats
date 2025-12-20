// apps/backend/routes/emailUnsubscribe.js
import express from 'express';
import {
  unsubscribeOneClick,
  unsubscribeViaLink,
  unsubscribeManual,
} from '../controllers/emailUnsubscribeController.js';

const router = express.Router();

// RFC 8058 One-Click
router.post(
  '/unsubscribe/one-click',
  express.text({ type: '*/*' }),
  unsubscribeOneClick,
);

// Token link from email: /api/email/unsubscribe?e=...&t=...
router.get('/unsubscribe', unsubscribeViaLink);

// Manual form fallback: POST { email }
router.post('/unsubscribe', express.json(), unsubscribeManual);

export default router;
