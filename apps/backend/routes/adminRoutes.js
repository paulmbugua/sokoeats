import { Router } from 'express';
import { overview } from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();
router.get('/overview', requireAuth, requireRole('admin'), overview);
export default router;
