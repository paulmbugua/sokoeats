// routes/paystackRoutes.js
import express from 'express';
import {
  createOrder,
  handlePaystackWebhook,
  cardCharge,
  submitOtpCharge,
} from '../controllers/paystackController.js';
import anyAuth from '../middleware/anyAuth.js';

const router = express.Router();

router.post('/create-order', anyAuth, createOrder);
router.post('/card-charge', anyAuth, cardCharge);
router.post('/submit-otp', anyAuth, submitOtpCharge);

// Raw body is important for signature verification
router.post('/webhook', express.raw({ type: '*/*' }), handlePaystackWebhook);

export default router;
