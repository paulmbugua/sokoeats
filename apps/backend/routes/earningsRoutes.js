import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  getEarningsSummary,
  getEarningsTransactions,
  getEarningsPayouts,
} from '../controllers/earningsController.js';

const router = express.Router();

router.get('/summary', authUser, getEarningsSummary);
router.get('/transactions', authUser, getEarningsTransactions);
router.get('/payouts', authUser, getEarningsPayouts);

export default router;
