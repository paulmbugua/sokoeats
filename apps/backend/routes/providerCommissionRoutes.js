import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  getProviderCommission,
  getProviderCommissionPayment,
  initiateProviderCommissionPayment,
  providerCommissionMpesaCallback,
} from '../controllers/providerCommissionController.js';

const router = express.Router();

router.get('/', authUser, getProviderCommission);
router.post('/pay', authUser, express.json(), initiateProviderCommissionPayment);
router.get('/payments/:id', authUser, getProviderCommissionPayment);
router.post('/mpesa-callback', express.json({ type: '*/*' }), providerCommissionMpesaCallback);

export default router;
