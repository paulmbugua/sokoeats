import express from 'express';
import {
  getPackages,
  initializeMpesaPayment,
  confirmMpesaPayment,
  updateMpesaReference,
} from '../controllers/paymentController.js';
import authUser from '../middleware/authUser.js'; // Ensure authentication middleware is used

const router = express.Router();

/**
 * ✅ Public Routes (Accessible to everyone)
 */
router.get('/packages', getPackages); // Fetch available packages

/**
 * ✅ Protected Routes (User Authentication Required)
 */
router.post('/initiate', authUser, initializeMpesaPayment); // Initiate M-Pesa Payment

router.put('/confirm', authUser, confirmMpesaPayment); // Confirm Payment Status
router.put('/update-mpesa', authUser, updateMpesaReference);

export default router;
