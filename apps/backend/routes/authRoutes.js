import { Router } from 'express';
import { validate } from '../validators/validate.js';
import { beginGoogleWebAuth, exchangeGoogleWebHandoff, googleAuth, googleWebCallback, login, me, register, updateProfile, deleteAccount } from '../controllers/authController.js';
import { googleAuthSchema, loginSchema, registerSchema, updateProfileSchema, deleteAccountSchema } from '../validators/authValidator.js';

const router = Router();
router.post('/auth/register', validate(registerSchema), register);
router.post('/auth/login', validate(loginSchema), login);
router.post('/auth/google', validate(googleAuthSchema), googleAuth);
router.get('/auth/google/web/start', beginGoogleWebAuth);
router.get('/auth/google/web/callback', googleWebCallback);
router.post('/auth/google/web/exchange', exchangeGoogleWebHandoff);
router.get('/auth/me', me);
router.patch('/auth/profile', validate(updateProfileSchema), updateProfile);
router.delete('/auth/account', validate(deleteAccountSchema), deleteAccount);

export default router;