import { Router } from 'express';
import { mapManifest, saveCustomerAddress, updateRiderLocation, updateVendorLocation } from '../controllers/mapController.js';
import { validate } from '../middleware/validate.js';
import { customerAddressSchema, riderLocationSchema, vendorLocationSchema } from '../validators/mapValidator.js';

const router = Router();
router.get('/maps/manifest', mapManifest);
router.post('/maps/rider/location', validate(riderLocationSchema), updateRiderLocation);
router.post('/maps/customer/addresses', validate(customerAddressSchema), saveCustomerAddress);
router.post('/maps/vendor/location', validate(vendorLocationSchema), updateVendorLocation);
export default router;