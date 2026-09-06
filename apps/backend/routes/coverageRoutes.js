import { Router } from 'express';
import { checkCoverage, createCity, createZone, listCoverage, setRiderZone, setVendorZone, updateCityCoverage } from '../controllers/coverageController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../validators/validate.js';
import { cityCoverageSchema, createCitySchema, createZoneSchema, zoneMembershipSchema } from '../validators/coverageValidator.js';

const router = Router();
router.get('/coverage', listCoverage);
router.get('/coverage/check', checkCoverage);
router.patch('/admin/coverage/cities/:cityKey', requireAuth, requireRole('admin'), validate(cityCoverageSchema), updateCityCoverage);
router.post('/admin/coverage/cities', requireAuth, requireRole('admin'), validate(createCitySchema), createCity);
router.post('/admin/coverage/cities/:cityId/zones', requireAuth, requireRole('admin'), validate(createZoneSchema), createZone);
router.put('/admin/coverage/vendors/:vendorId/zones/:zoneId', requireAuth, requireRole('admin'), validate(zoneMembershipSchema), setVendorZone);
router.put('/admin/coverage/riders/:riderId/zones/:zoneId', requireAuth, requireRole('admin'), validate(zoneMembershipSchema), setRiderZone);
export default router;
