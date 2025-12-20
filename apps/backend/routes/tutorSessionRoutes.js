import express from 'express';
import {
  createSession,
  completeSession,
  confirmCompletion,
  fetchDataByType,
  createZoomLink,
  acceptSession,
  cancelSession,
} from '../controllers/tutorSessionController.js';
import authUser from '../middleware/authUser.js';

const router = express.Router();

// Session-related routes
router.post('/session/create', authUser, createSession); // Create a new session
router.put('/session/complete-pending', authUser, completeSession); // Tutor marks session as complete-pending
router.put('/session/confirm-completion', authUser, confirmCompletion); // Student confirms session completion
router.put('/:sessionId/accept', authUser, acceptSession);
router.put('/:sessionId/cancel', authUser, cancelSession); // Cancel a session

// Zoom-related route
router.post('/create-zoom-link', authUser, createZoomLink); // Create a Zoom link for a session

// Fetch data routes
router.get('/:type', authUser, fetchDataByType); // Fetch data by type (session, earnings, or reviews)

export default router;
