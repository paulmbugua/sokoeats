import { Router } from 'express';
import { dismissNotification, listNotifications, markNotificationRead, registerPushToken } from '../controllers/notificationController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.get('/notifications', requireAuth, listNotifications);
router.post('/push-tokens', requireAuth, registerPushToken);
router.post('/notifications/:id/read', requireAuth, markNotificationRead);
router.delete('/notifications/:id', requireAuth, dismissNotification);
export default router;
