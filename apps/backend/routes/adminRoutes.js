import { Router } from 'express';
import { overview } from '../controllers/adminController.js';
import { adminDeleteNotification, adminListNotifications, adminSendNotification } from '../controllers/notificationController.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { adminListDeliveryPartnerApplications, reviewDeliveryPartnerApplication } from '../controllers/deliveryPartnerController.js';

const router = Router();
router.get('/overview', requireAuth, requireRole('admin'), overview);
router.get('/delivery-partners', requireAuth, requireRole('admin'), adminListDeliveryPartnerApplications);
router.patch('/delivery-partners/:id/review', requireAuth, requireRole('admin'), reviewDeliveryPartnerApplication);
router.get('/notifications', requireAuth, requireRole('admin'), adminListNotifications);
router.post('/notifications', requireAuth, requireRole('admin'), adminSendNotification);
router.delete('/notifications/:id', requireAuth, requireRole('admin'), adminDeleteNotification);
export default router;
