import { Router } from 'express';
import { confirmCheckoutPayment, initiateCheckoutPayment, mpesaCheckoutCallback } from '../controllers/paymentController.js';
import { validate } from '../validators/validate.js';
import { checkoutPaymentSchema } from '../validators/paymentValidator.js';

const router = Router();
router.post('/payments/checkout', validate(checkoutPaymentSchema), initiateCheckoutPayment);
router.post('/payments/:reference/confirm', confirmCheckoutPayment);
router.post('/payments/mpesa/callback', mpesaCheckoutCallback);
router.post('/mpesa/callback', mpesaCheckoutCallback);
export default router;
