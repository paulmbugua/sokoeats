import { Router } from 'express';
import { createVendor, vendorDashboard } from '../controllers/vendorController.js';
import { validate } from '../validators/validate.js';
import { vendorSchema } from '../validators/vendorValidator.js';
const router = Router();
router.get('/vendor-dashboard', vendorDashboard);
router.post('/vendors', validate(vendorSchema), createVendor);
export default router;
