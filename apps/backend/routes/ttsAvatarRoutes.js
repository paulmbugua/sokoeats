import { Router } from 'express';
import {
  speakRobot,
  streamRobot,
  listVoices,
} from '../controllers/ttsAvatarController.js';

const router = Router();

router.post('/speak', speakRobot);
router.get('/stream/:id', streamRobot);
router.get('/voices', listVoices);

export default router;
