// apps/backend/routes/uploadRoutes.js
import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  presignPut,
  finalize,
  deleteObject,
  presignGet,
  isR2Url,
} from '../services/r2UploadService.js';

const router = express.Router();

const MAX_VIDEO_BYTES = Number(process.env.R2_MAX_VIDEO_BYTES || 300 * 1024 * 1024);
const MAX_PREVIEW_BYTES = Number(process.env.R2_MAX_PREVIEW_BYTES || 100 * 1024 * 1024);

const ALLOWED_KINDS = ['video', 'preview', 'avatar', 'thumbnail', 'pdf'];

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function validateContentType(kind, contentType) {
  if (kind === 'video' || kind === 'preview') {
    return typeof contentType === 'string' && contentType.startsWith('video/');
  }
  return true;
}

function validateSize(kind, sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return false;
  if (kind === 'video') return sizeBytes <= MAX_VIDEO_BYTES;
  if (kind === 'preview') return sizeBytes <= MAX_PREVIEW_BYTES;
  return true;
}

router.post('/api/uploads/presign', authUser, express.json(), async (req, res) => {
  try {
    const userId = req.user?.id;
    const { kind, filename, contentType, sizeBytes } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!ALLOWED_KINDS.includes(kind)) {
      return badRequest(res, 'Invalid kind. Use video, preview, avatar, thumbnail, or pdf.');
    }

    if (kind === 'avatar' || kind === 'thumbnail' || kind === 'pdf') {
      return res.json({ provider: 'cloudinary', message: 'Use existing Cloudinary upload flow' });
    }

    if (!filename || typeof filename !== 'string') {
      return badRequest(res, 'filename is required.');
    }

    if (!validateContentType(kind, contentType)) {
      return badRequest(res, 'Invalid contentType. Expected a video/* mime type.');
    }

    const sizeNum = Number(sizeBytes);
    if (!validateSize(kind, sizeNum)) {
      const limit = kind === 'video' ? MAX_VIDEO_BYTES : MAX_PREVIEW_BYTES;
      return badRequest(res, `sizeBytes must be > 0 and <= ${limit} bytes.`);
    }

    const presign = await presignPut({
      kind,
      filename,
      contentType,
      sizeBytes: sizeNum,
      ownerId: String(userId),
    });

    return res.json({
      provider: 'r2',
      bucket: presign.bucket,
      objectPath: presign.objectPath,
      method: 'PUT',
      uploadUrl: presign.uploadUrl,
      headers: { 'Content-Type': contentType },
      expiresInSec: presign.expiresInSec,
    });
  } catch (err) {
    console.error('[uploads/presign] error', err);
    return res.status(500).json({ message: 'Failed to create upload URL.' });
  }
});

router.post('/api/uploads/complete', authUser, express.json(), (req, res) => {
  try {
    const { provider, bucket, objectPath } = req.body || {};

    if (provider !== 'r2') {
      return badRequest(res, 'provider must be r2.');
    }

    if (!bucket || !objectPath) {
      return badRequest(res, 'bucket and objectPath are required.');
    }

    const result = finalize({ bucket, objectPath });
    return res.json(result);
  } catch (err) {
    console.error('[uploads/complete] error', err);
    return res.status(500).json({ message: 'Failed to finalize upload.' });
  }
});

router.delete('/api/uploads', authUser, express.json(), async (req, res) => {
  try {
    const { provider, bucket, objectPath, url } = req.body || {};

    const shouldDelete = provider === 'r2' || isR2Url(url);
    if (!shouldDelete) {
      return badRequest(res, 'Upload is not an R2 asset.');
    }

    await deleteObject({ bucket, objectPath, url });
    return res.status(204).send();
  } catch (err) {
    console.error('[uploads/delete] error', err);
    return res.status(500).json({ message: 'Failed to delete upload.' });
  }
});

router.get('/media/:bucket/*', authUser, async (req, res) => {
  try {
    const bucket = req.params.bucket;
    const objectPath = req.params[0];

    if (!bucket || !objectPath) {
      return res.status(404).json({ message: 'Media not found.' });
    }

    // TODO: enforce entitlement checks for ClassVault paid videos.
    const { url } = await presignGet({ bucket, objectPath, expiresInSec: 60 });
    return res.redirect(302, url);
  } catch (err) {
    console.error('[media] error', err);
    return res.status(500).json({ message: 'Failed to fetch media.' });
  }
});

export default router;
