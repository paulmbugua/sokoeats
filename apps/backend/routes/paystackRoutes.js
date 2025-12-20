// routes/paystackRoutes.js
import express from 'express';
import {
  createOrder,
  handlePaystackWebhook,
  cardCharge,
  submitOtpCharge,
} from '../controllers/paystackController.js';
import { verifyAndFinalize } from '../controllers/paystackVerifyController.js';
import anyAuth from '../middleware/anyAuth.js';

const router = express.Router();

// ✅ NEW: Paystack return → redirect to deep link
router.get('/return', (req, res) => {
  // IMPORTANT: use host-based deep link because your intentFilter is host-based
  // daybreak://paystack/callback
  const deep = new URL('daybreak://paystack/callback');

  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null) continue;
    deep.searchParams.set(k, String(v));
  }

  if (!deep.searchParams.get('reference') && deep.searchParams.get('trxref')) {
    deep.searchParams.set('reference', deep.searchParams.get('trxref'));
  }

  return res.redirect(302, deep.toString());
});

router.post('/create-order', anyAuth, createOrder);
router.post('/card-charge', anyAuth, cardCharge);
router.post('/submit-otp', anyAuth, submitOtpCharge);
router.get('/verify/:reference', verifyAndFinalize);

export default router;
