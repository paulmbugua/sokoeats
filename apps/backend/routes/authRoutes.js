// apps/backend/src/routes/authRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  register,
  login,
  googleAuth,
  requestOtp,
  verifyOtp,
  me,
  confirmEmail,
  resendEmailConfirmation,
} from '../controllers/authController.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.post('/otp/request', requestOtp);
router.get('/email/confirm', confirmEmail);
router.post('/email/confirm', confirmEmail);
router.post('/email/resend', authUser, resendEmailConfirmation);
router.post('/otp/verify', verifyOtp);
router.get('/me', authUser, me);

export default router;
