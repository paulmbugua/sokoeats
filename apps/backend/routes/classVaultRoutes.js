// apps/backend/routes/classVaultRoutes.js
import express from 'express';
import authUser from '../middleware/authUser.js';
import requireTutorProfile from '../middleware/requireTutorProfile.js';

import upload from '../middleware/multer.js';

// ⬇ use a namespace import so you see what actually exists
import * as classVault from '../controllers/classVaultController.js';
import { uploadSingleFile } from '../controllers/profileController.js';

const router = express.Router();

/* Public reads */
router.get('/explore', classVault.listMarketplaceVideos);
router.get('/:id(\\d+)', classVault.getVideoById);
router.get('/', classVault.getAllVideos);

/* Auth-only reads */
router.get('/purchases', authUser, classVault.getPurchases);
router.get('/mine', authUser, requireTutorProfile, classVault.listMyVideos);
router.get('/download/:videoId(\\d+)', authUser, classVault.downloadPdfOrVideo);


/* -------------------------
   Tutor-only writes (metadata + uploads)
   - We gate metadata creation/update/delete
   - We also gate direct file uploads if you want ONLY tutors uploading assets
------------------------- */

// Create metadata (JSON)
router.post('/', authUser, requireTutorProfile, express.json(), classVault.createVideoJson);

// Upload raw asset to your backend (if still used)
router.post(
  '/upload/:type(video|pdf|preview|thumbnail)',
  authUser,
  requireTutorProfile,
  upload.single('file'),
  uploadSingleFile,
);

// Update metadata
router.put('/:id(\\d+)', authUser, requireTutorProfile, express.json(), classVault.updateVideoJson);

// Delete
router.delete('/:id(\\d+)', authUser, requireTutorProfile, classVault.deleteVideoById);

/* -------------------------
   Purchases (students)
------------------------- */
router.post('/:id(\\d+)/purchase', authUser, classVault.purchaseClass);

export default router;
