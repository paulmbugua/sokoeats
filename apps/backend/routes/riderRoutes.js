import { Router } from 'express';
import { acceptDeliveryRequest, activeDelivery, confirmPickup, markArrived, riderHome } from '../controllers/riderController.js';

const router = Router();
router.get('/rider/home', riderHome);
router.get('/rider/active-delivery', activeDelivery);
router.post('/rider/requests/:id/accept', acceptDeliveryRequest);
router.post('/rider/deliveries/:orderCode/arrived', markArrived);
router.post('/rider/deliveries/:orderCode/pickup', confirmPickup);

export default router;
