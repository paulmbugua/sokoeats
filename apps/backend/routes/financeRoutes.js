import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validators/validate.js';
import {
  acceptVendorOrder, assignOrderRider, deliverOrder, executePayout, getAdminFinanceDashboard,
  getOrderFinance, getRiderFinanceDashboard, getVendorCompliance, getVendorFinanceDashboard,
  mpesaRefundCallback, openDispute, paystackTransferWebhook, pickupOrder, processDue,
  refreshPayout, requestOrderRefund, resolveDispute, reviewVendorCompliance,
  updateRiderPayoutProfile, updateVendorCompliance,
} from '../controllers/financeController.js';
import {
  assignRiderSchema, deliveryOtpSchema, disputeResolutionSchema, disputeSchema, refundSchema,
  riderPayoutSchema, vendorComplianceSchema, vendorReviewSchema,
} from '../validators/financeValidator.js';

const router = Router();

router.post('/finance/paystack/webhook', paystackTransferWebhook);
router.post('/finance/mpesa/refund-callback', mpesaRefundCallback);

router.get('/vendor/compliance', requireAuth, requireRole('vendor', 'merchant'), getVendorCompliance);
router.put('/vendor/compliance', requireAuth, requireRole('vendor', 'merchant'), validate(vendorComplianceSchema), updateVendorCompliance);
router.get('/vendor/finance', requireAuth, requireRole('vendor', 'merchant'), getVendorFinanceDashboard);
router.patch('/admin/vendors/:vendorId/compliance', requireAuth, requireRole('admin', 'support'), validate(vendorReviewSchema), reviewVendorCompliance);

router.put('/rider/payout-profile', requireAuth, requireRole('rider', 'courier'), validate(riderPayoutSchema), updateRiderPayoutProfile);
router.get('/rider/finance', requireAuth, requireRole('rider', 'courier'), getRiderFinanceDashboard);

router.get('/finance/orders/:orderKey', requireAuth, getOrderFinance);
router.post('/finance/orders/:orderKey/vendor-accept', requireAuth, requireRole('vendor', 'merchant'), acceptVendorOrder);
router.post('/finance/orders/:orderKey/assign-rider', requireAuth, requireRole('admin', 'support'), validate(assignRiderSchema), assignOrderRider);
router.post('/finance/orders/:orderKey/pickup', requireAuth, requireRole('rider', 'courier'), pickupOrder);
router.post('/finance/orders/:orderKey/deliver', requireAuth, requireRole('rider', 'courier'), validate(deliveryOtpSchema), deliverOrder);
router.post('/finance/orders/:orderKey/disputes', requireAuth, validate(disputeSchema), openDispute);
router.post('/finance/orders/:orderKey/refunds', requireAuth, requireRole('customer', 'admin', 'support'), validate(refundSchema), requestOrderRefund);

router.get('/admin/finance', requireAuth, requireRole('admin', 'support'), getAdminFinanceDashboard);
router.patch('/finance/disputes/:disputeId', requireAuth, requireRole('admin', 'support'), validate(disputeResolutionSchema), resolveDispute);
router.post('/finance/process-due', requireAuth, requireRole('admin'), processDue);
router.post('/finance/payouts/:payoutKey/execute', requireAuth, requireRole('admin'), executePayout);
router.post('/finance/payouts/:payoutKey/refresh', requireAuth, requireRole('admin', 'support'), refreshPayout);

export default router;
