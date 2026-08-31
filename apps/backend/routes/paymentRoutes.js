import { Router } from 'express';
import { confirmCheckoutPayment, initiateCheckoutPayment, mpesaCheckoutCallback } from '../controllers/paymentController.js';
import { validate } from '../validators/validate.js';
import { checkoutPaymentSchema } from '../validators/paymentValidator.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.post('/payments/checkout', requireAuth, validate(checkoutPaymentSchema), initiateCheckoutPayment);
router.post('/payments/:reference/confirm', requireAuth, confirmCheckoutPayment);
router.post('/payments/mpesa/callback', mpesaCheckoutCallback);
router.post('/mpesa/callback', mpesaCheckoutCallback);
export default router;
