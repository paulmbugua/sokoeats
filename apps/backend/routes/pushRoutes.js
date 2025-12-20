import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  registerPushToken,
  unregisterPushToken,
} from '../controllers/pushController.js';

const router = express.Router();

router.post('/register', authUser, registerPushToken);
router.post('/unregister', authUser, unregisterPushToken);

export default router;
