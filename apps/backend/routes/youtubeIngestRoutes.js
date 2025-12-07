// apps/backend/routes/youtubeIngestRoutes.js
import { Router } from 'express';
import { adminAuth } from '../middleware/adminAuth.js';
import {
  ingestYouTube,
  listYouTube,
  deleteYouTube,
} from '../controllers/youtubeIngestController.js';

const router = Router();

// POST /api/oer/ingest/youtube
router.post('/oer/ingest/youtube', adminAuth, ingestYouTube);

// GET /api/oer/youtube — list collections
router.get('/oer/youtube', adminAuth, listYouTube);

// DELETE /api/oer/youtube/:collectionId — delete one collection
router.delete('/oer/youtube/:collectionId', adminAuth, deleteYouTube);

// Health check (optional)
router.get('/oer/ingest/youtube/health', (req, res) => {
  res.json({ ok: true, route: 'youtube ingest' });
});

export default router;
