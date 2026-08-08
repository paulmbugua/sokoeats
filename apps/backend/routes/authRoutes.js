import { Router } from 'express';
import { validate } from '../validators/validate.js';
import { googleAuth, login, me, register, updateProfile } from '../controllers/authController.js';
import { googleAuthSchema, loginSchema, registerSchema, updateProfileSchema } from '../validators/authValidator.js';

const router = Router();
router.post('/auth/register', validate(registerSchema), register);
router.post('/auth/login', validate(loginSchema), login);
router.post('/auth/google', validate(googleAuthSchema), googleAuth);
router.get('/auth/me', me);
router.patch('/auth/profile', validate(updateProfileSchema), updateProfile);

export default router;