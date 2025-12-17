import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  sendMessage,
  getConversations,
  getMessages,
  markAsRead,
} from '../controllers/profileActionsController.js';

const router = express.Router();

// Matches packages/shared/api/messagesApi.ts
router.get('/conversations', authUser, getConversations);
router.get('/messages/:recipientId', authUser, getMessages);
router.post('/messages', authUser, sendMessage);

// App uses body { recipientId }
router.post('/messages/mark-read', authUser, (req, res) => {
  req.params.recipientId = req.body?.recipientId;
  return markAsRead(req, res);
});

export default router;
