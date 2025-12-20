import { Router } from 'express';
import { login, adminEnvLogin } from '../controllers/sessionController.js';

const router = Router();

// Public auth endpoints
router.post('/login', login); // → POST /api/auth/login
router.post('/admin-env-login', adminEnvLogin); // → POST /api/auth/admin-env-login (optional bootstrap)

export default router;
