import { Router } from 'express';
import {
  generateTranscript,
  getTranscript,
  downloadTranscript,
  listMyTranscripts, // ✅ add
} from '../controllers/transcriptsController.js';
import anyAuth from '../middleware/anyAuth.js';
import { ensureCourseFullyWatched } from '../controllers/progressWatchController.js';

const r = Router();

r.post('/generate', anyAuth, ensureCourseFullyWatched, generateTranscript);

// ✅ MUST be before "/:id"
r.get('/me', anyAuth, listMyTranscripts);

r.get('/:id', anyAuth, getTranscript);
r.get('/:id/download', anyAuth, downloadTranscript);

export default r;
