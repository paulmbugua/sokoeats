import { Router } from 'express';
import {
  generateTranscript,
  getTranscript,
  downloadTranscript,
} from '../controllers/transcriptsController.js';
import anyAuth from '../middleware/anyAuth.js';
import { ensureCourseFullyWatched } from '../controllers/progressWatchController.js';

const r = Router();

// Require auth AND fully-watched before generating
r.post('/generate', anyAuth, ensureCourseFullyWatched, generateTranscript);

r.get('/:id', anyAuth, getTranscript);
r.get('/:id/download', anyAuth, downloadTranscript);
export default r;
