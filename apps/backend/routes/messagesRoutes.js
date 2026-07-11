// apps/backend/src/routes/messagesRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import { listConversations, getMessages, sendMessage, startConversation } from '../controllers/messagesController.js';

const router = express.Router();

router.get('/conversations', authUser, listConversations);
router.post('/conversations/start', authUser, startConversation);
router.post('/bookings/:bookingId/conversation', authUser, startConversation);
router.get('/conversations/:id/messages', authUser, getMessages);
router.post('/conversations/:id/messages', authUser, sendMessage);

export default router;
