import { Router } from 'express';
import { getVendorMenu, listMenu, listVendors } from '../controllers/catalogController.js';
const router = Router();
router.get('/vendors', listVendors);
router.get('/menu', listMenu);
router.get('/vendors/:slug/menu', getVendorMenu);
export default router;

