import { Router } from 'express';
import { acceptDeliveryRequest, activeDelivery, confirmPickup, markArrived, requestRiderPayout, riderEarnings, riderHome, riderLeaderboard, riderOnboarding, riderPayoutConfirmation, riderProfileRatings, updateRiderOnboardingStep } from '../controllers/riderController.js';
import { validate } from '../validators/validate.js';
import { riderOnboardingStepSchema } from '../validators/interactionValidator.js';

const router = Router();
router.get('/rider/home', riderHome);
router.get('/rider/onboarding', riderOnboarding);
router.patch('/rider/onboarding/:screenKey', validate(riderOnboardingStepSchema), updateRiderOnboardingStep);
router.get('/rider/earnings', riderEarnings);
router.post('/rider/payouts', requestRiderPayout);
router.get('/rider/payout-confirmation', riderPayoutConfirmation);
router.get('/rider/leaderboard', riderLeaderboard);
router.get('/rider/profile-ratings', riderProfileRatings);
router.get('/rider/active-delivery', activeDelivery);
router.post('/rider/requests/:id/accept', acceptDeliveryRequest);
router.post('/rider/deliveries/:orderCode/arrived', markArrived);
router.post('/rider/deliveries/:orderCode/pickup', confirmPickup);

export default router;
