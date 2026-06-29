// apps/backend/src/routes/quotesRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  listQuotesForJob,
  getQuote,
  acceptQuote,
  quoteMessage,
  submitQuote,
  listHandymanQuotes,
  getBooking,
  cancelBooking,
} from '../controllers/quotesController.js';

const router = express.Router();

router.get('/handyman/quotes', authUser, listHandymanQuotes);
router.get('/bookings/:id', authUser, getBooking);
router.post('/bookings/:id/cancel', authUser, cancelBooking);
router.post('/handyman/jobs/:id/quotes', authUser, submitQuote);
router.get('/jobs/:id/quotes', authUser, listQuotesForJob);
router.get('/quotes/:id', authUser, getQuote);
router.post('/quotes/:id/accept', authUser, acceptQuote);
router.post('/quotes/:id/message', authUser, quoteMessage);

export default router;
