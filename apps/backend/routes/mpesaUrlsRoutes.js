import express from 'express';
import {
  mpesaCallback,
  b2cResult,
  b2cTimeout,
} from '../controllers/mpesaUrls.js'; // Keeping original controller file name
import { orgStkCallback } from '../controllers/orgMpesaUrls.js';

const router = express.Router();

// ✅ POST: Handle Student M-Pesa STK Push Callback
router.post('/callback', mpesaCallback);

// ✅ POST: Handle Organization M-Pesa STK Push Callback
// Set MPESA_ORG_CALLBACK_URL to point here (e.g., https://your-backend.com/api/mpesa/org-stk-callback)
router.post('/org-stk-callback', orgStkCallback);

// ✅ POST: Handle M-Pesa B2C Payment Result (Withdrawals)
router.post('/b2c-result', b2cResult);

// ✅ POST: Handle M-Pesa B2C Timeout (Withdrawals)
router.post('/timeout', b2cTimeout);

export default router;
