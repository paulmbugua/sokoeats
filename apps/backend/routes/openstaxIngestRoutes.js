import { Router } from 'express';
import {
  ingestOpenStax,
  listOpenStax,
  deleteOpenStax,
} from '../controllers/openstaxIngestController.js';
import { adminAuth } from '../middleware/adminAuth.js';

const router = Router();

// Ingest / re-ingest
router.post('/oer/ingest/openstax', adminAuth, ingestOpenStax);

// List existing uploads (for admin UI)
router.get('/oer/openstax', adminAuth, listOpenStax);

// Delete one upload by course id
router.delete('/oer/openstax/:courseId', adminAuth, deleteOpenStax);

// Optional: quick health check
router.get('/oer/ingest/health', (req, res) => {
  res.json({ ok: true, route: 'openstax ingest' });
});

export default router;
