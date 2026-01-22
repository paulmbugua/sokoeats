import express from 'express';
import {
  addToFavorites,
  sendMessage,
  prebookingInquiry,
  getConversations,
  getMessages,
  markAsRead,
  deleteMessage,
  deleteConversation,
} from '../controllers/profileActionsController.js';
import authUser from '../middleware/authUser.js';

const router = express.Router();

/**
 * ✅ Protected Routes (User Authentication Required)
 */
router.post('/favorites', authUser, addToFavorites); // Add profile to favorites
router.post('/conversations/messages', authUser, sendMessage); // Send a message
router.post('/prebookingInquiry', authUser, prebookingInquiry); // Send prebooking inquiry
router.get('/conversations', authUser, getConversations); // Get conversations with pagination
router.get('/conversations/:recipientId/messages', authUser, getMessages); // Get messages in a conversation
router.post('/conversations/:recipientId/markAsRead', authUser, markAsRead); // Mark messages as read
router.delete(
  '/conversations/:conversationId/message/:messageId',
  authUser,
  deleteMessage,
); // Delete a message
router.delete('/conversations/:conversationId', authUser, deleteConversation); // Delete a conversation

export default router;
