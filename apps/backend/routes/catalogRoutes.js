import { Router } from 'express';
import { listMenu, listVendors } from '../controllers/catalogController.js';
const router = Router();
router.get('/vendors', listVendors);
router.get('/menu', listMenu);
export default router;
