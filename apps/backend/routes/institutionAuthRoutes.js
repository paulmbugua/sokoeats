// apps/backend/routes/institutionAuthRoutes.js
import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  institutionLogin,
  institutionRegister,
  institutionGoogleLogin,
  institutionRequestPasswordReset,
  institutionVerifyOTPAndResetPassword,
  institutionChangePassword,
} from '../controllers/institutionAuthController.js';

const router = express.Router();

// Base: /api/institutions/auth
router.post('/login', institutionLogin);
router.post('/register', institutionRegister);
router.post('/google', institutionGoogleLogin);
router.post('/password/request-otp', institutionRequestPasswordReset);
router.post('/password/verify', institutionVerifyOTPAndResetPassword);
router.post('/change-password', requireAuth, institutionChangePassword);
// Protected sanity check (optional)
router.get('/whoami', requireAuth, (req, res) =>
  res.json({ ok: true, user: req.user }),
);

export default router;
