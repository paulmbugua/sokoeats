import { Router } from 'express';
import { getVendorMenu, listMenu, listVendors, similarMenuItems } from '../controllers/catalogController.js';
const router = Router();
router.get('/vendors', listVendors);
router.get('/menu', listMenu);
router.get('/vendors/:slug/menu', getVendorMenu);
router.get('/menu/:id/similar', similarMenuItems);
export default router;

