import { Router } from 'express';
import { confirmCheckoutPayment, initiateCheckoutPayment } from '../controllers/paymentController.js';
import { validate } from '../validators/validate.js';
import { checkoutPaymentSchema } from '../validators/paymentValidator.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.post('/payments/checkout', requireAuth, validate(checkoutPaymentSchema), initiateCheckoutPayment);
router.post('/payments/:reference/confirm', requireAuth, confirmCheckoutPayment);
export default router;
