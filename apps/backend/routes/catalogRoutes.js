import { Router } from 'express';
import { getVendorMenu, listMenu, listVendors, marketplaceOffers, similarMenuItems } from '../controllers/catalogController.js';
const router = Router();
router.get('/marketplace/offers', marketplaceOffers);
router.get('/vendors', listVendors);
router.get('/menu', listMenu);
router.get('/vendors/:slug/menu', getVendorMenu);
router.get('/menu/:id/similar', similarMenuItems);
export default router;
