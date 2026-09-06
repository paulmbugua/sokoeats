import { Router } from 'express';
import { validate } from '../validators/validate.js';
import { beginGoogleWebAuth, changePassword, exchangeGoogleWebHandoff, googleAuth, googleWebCallback, login, me, register, updateProfile, deleteAccount } from '../controllers/authController.js';
import { changePasswordSchema, googleAuthSchema, loginSchema, registerSchema, updateProfileSchema, deleteAccountSchema } from '../validators/authValidator.js';
import { getPartnerTerms } from '../services/partnerTerms.js';
import { requireAuth } from '../middleware/auth.js';
import pool from '../config/db.js';

const router = Router();
router.get('/legal/terms/:role', (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json(getPartnerTerms(req.params.role)); } catch (error) { next(error); }
});
router.get('/auth/terms/acceptances', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT role, version, document_hash, document, accepted_at FROM sokoeats_terms_acceptances WHERE user_id=$1 ORDER BY accepted_at DESC', [req.auth.sub]);
    res.set('Cache-Control', 'no-store').json({ acceptances: rows });
  } catch (error) { next(error); }
});
router.post('/auth/register', validate(registerSchema), register);
router.post('/auth/login', validate(loginSchema), login);
router.post('/auth/google', validate(googleAuthSchema), googleAuth);
router.get('/auth/google/web/start', beginGoogleWebAuth);
router.get('/auth/google/web/callback', googleWebCallback);
router.get('/auth/google/callback', googleWebCallback);
router.post('/auth/google/web/exchange', exchangeGoogleWebHandoff);
router.get('/auth/me', me);
router.patch('/auth/password', requireAuth, validate(changePasswordSchema), changePassword);
router.patch('/auth/profile', validate(updateProfileSchema), updateProfile);
router.delete('/auth/account', validate(deleteAccountSchema), deleteAccount);

export default router;
