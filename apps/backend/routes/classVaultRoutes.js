// apps/backend/routes/classVaultRoutes.js
import express from 'express';
import authUser from '../middleware/authUser.js';
import upload from '../middleware/multer.js';

// ⬇ use a namespace import so you see what actually exists
import * as classVault from '../controllers/classVaultController.js';
import { uploadSingleFile } from '../controllers/profileController.js';

const router = express.Router();

// (Optional) one-time debug — remove after confirming
// console.log('classVault exports:', Object.keys(classVault));

router.get('/', classVault.getAllVideos);
router.get('/explore', classVault.listMarketplaceVideos);
router.get('/purchases', authUser, classVault.getPurchases);
router.get('/mine', authUser, classVault.listMyVideos);
router.get('/download/:videoId(\\d+)', authUser, classVault.downloadPdfOrVideo);
router.get('/:id(\\d+)', classVault.getVideoById);

router.post('/', authUser, express.json(), classVault.createVideoJson);
router.post(
  '/upload/:type(video|pdf|preview|thumbnail)',
  authUser,
  upload.single('file'),
  uploadSingleFile,
);
router.post('/:id(\\d+)/purchase', authUser, classVault.purchaseClass);
router.put('/:id(\\d+)', authUser, express.json(), classVault.updateVideoJson);
router.delete('/:id(\\d+)', authUser, classVault.deleteVideoById);

export default router;
