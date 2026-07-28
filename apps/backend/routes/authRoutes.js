// apps/backend/src/routes/authRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  register,
  login,
  googleAuth,
  requestOtp,
  verifyOtp,
  requestPasswordOtp,
  resetPasswordWithOtp,
  me,
  confirmEmail,
  resendEmailConfirmation,
  completeProfile,
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
router.post('/password/otp/request', requestPasswordOtp);
router.post('/password/otp/reset', resetPasswordWithOtp);
router.get('/me', authUser, me);
router.patch('/profile/complete', authUser, completeProfile);

export default router;

