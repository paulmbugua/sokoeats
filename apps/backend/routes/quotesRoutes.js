// apps/backend/src/routes/quotesRoutes.js

import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  listQuotesForJob,
  getQuote,
  acceptQuote,
  declineQuote,
  quoteMessage,
  submitQuote,
  listHandymanQuotes,
  getBooking,
  reportClientIssue,
  updateBookingLocation,
  markBookingArrived,
  markBookingComplete,
  rateBookingProvider,
  cancelBooking,
} from '../controllers/quotesController.js';

const router = express.Router();

router.get('/handyman/quotes', authUser, listHandymanQuotes);
router.get('/bookings/:id', authUser, getBooking);
router.put('/bookings/:id/location', authUser, express.json(), updateBookingLocation);
router.post('/bookings/:id/arrived', authUser, markBookingArrived);
router.post('/bookings/:id/complete', authUser, markBookingComplete);
router.post('/bookings/:id/rating', authUser, rateBookingProvider);
router.post('/bookings/:id/cancel', authUser, cancelBooking);
router.post('/bookings/:id/client-feedback', authUser, reportClientIssue);
router.post('/handyman/jobs/:id/quotes', authUser, submitQuote);
router.get('/jobs/:id/quotes', authUser, listQuotesForJob);
router.get('/quotes/:id', authUser, getQuote);
router.post('/quotes/:id/accept', authUser, acceptQuote);
router.post('/quotes/:id/decline', authUser, declineQuote);
router.post('/quotes/:id/message', authUser, quoteMessage);

export default router;

