import { Router } from 'express';
import { mobileVersion } from '../controllers/versionController.js';

const router = Router();

router.get('/mobile/version', mobileVersion);

export default router;
