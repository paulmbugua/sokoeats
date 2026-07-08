// apps/backend/routes/uploadRoutes.js
import express from 'express';
import authUser from '../middleware/authUser.js';
import {
  presignPut,
  finalize,
  deleteObject,
  presignGet,
  isR2Url,
  resolveKind,
} from '../services/r2UploadService.js';

const router = express.Router();

const MAX_VIDEO_BYTES = Number(process.env.R2_MAX_VIDEO_BYTES || 300 * 1024 * 1024);
const MAX_PREVIEW_BYTES = Number(process.env.R2_MAX_PREVIEW_BYTES || 100 * 1024 * 1024);
const MAX_IMAGE_BYTES = Number(process.env.R2_MAX_IMAGE_BYTES || 10 * 1024 * 1024);
const MAX_AUDIO_BYTES = Number(process.env.R2_MAX_AUDIO_BYTES || 25 * 1024 * 1024);
const MAX_DOC_BYTES = Number(process.env.R2_MAX_DOC_BYTES || 50 * 1024 * 1024);
const MAX_AI_BYTES = Number(process.env.R2_MAX_AI_BYTES || 5 * 1024 * 1024);

const ALLOWED_KINDS = [
  'video',
  'preview',
  'thumbnail',
  'image',
  'avatar',
  'banner',
  'audio',
  'tts',
  'pdf',
  'doc',
  'ai',
  'transcript',
];

function badRequest(res, message) {
  return res.status(400).json({ message });
}

function validateContentType(kind, contentType) {
  if (typeof contentType !== 'string' || !contentType) return false;
  if (kind === 'video') {
    return contentType.startsWith('video/');
  }
  if (kind === 'preview') {
    return contentType.startsWith('image/') || contentType.startsWith('video/');
  }
  if (kind === 'thumbnail' || kind === 'image' || kind === 'avatar' || kind === 'banner') {
    return contentType.startsWith('image/');
  }
  if (kind === 'audio' || kind === 'tts') {
    return contentType.startsWith('audio/');
  }
  if (kind === 'pdf') {
    return contentType === 'application/pdf';
  }
  if (kind === 'ai' || kind === 'transcript') {
    return (
      contentType.startsWith('text/') ||
      contentType === 'application/json' ||
      contentType === 'application/xml' ||
      contentType === 'application/octet-stream'
    );
  }
  return true;
}

function validateSize(kind, sizeBytes) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return false;
  if (kind === 'video') return sizeBytes <= MAX_VIDEO_BYTES;
  if (kind === 'preview') return sizeBytes <= MAX_PREVIEW_BYTES;
  if (kind === 'thumbnail' || kind === 'image' || kind === 'avatar' || kind === 'banner') {
    return sizeBytes <= MAX_IMAGE_BYTES;
  }
  if (kind === 'audio' || kind === 'tts') return sizeBytes <= MAX_AUDIO_BYTES;
  if (kind === 'pdf' || kind === 'doc') return sizeBytes <= MAX_DOC_BYTES;
  if (kind === 'ai' || kind === 'transcript') return sizeBytes <= MAX_AI_BYTES;
  return true;
}

router.post('/api/uploads/presign', authUser, express.json(), async (req, res) => {
  try {
    const userId = req.user?.id;
    const rawKind = req.body?.kind;
    const kind = resolveKind(rawKind);
    const { filename, contentType, sizeBytes } = req.body || {};

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required.' });
    }

    if (!ALLOWED_KINDS.includes(kind)) {
      return badRequest(res, 'Invalid kind.');
    }

    if (!filename || typeof filename !== 'string') {
      return badRequest(res, 'filename is required.');
    }

    if (!validateContentType(kind, contentType)) {
      return badRequest(res, 'Invalid contentType for upload kind.');
    }

    const sizeNum = Number(sizeBytes);
    if (!validateSize(kind, sizeNum)) {
      return badRequest(res, 'sizeBytes must be > 0 and within size limits.');
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
    const { provider, bucket, objectPath, kind } = req.body || {};

    if (provider !== 'r2') {
      return badRequest(res, 'provider must be r2.');
    }

    if (!bucket || !objectPath) {
      return badRequest(res, 'bucket and objectPath are required.');
    }

    const result = finalize({ bucket, objectPath, kind });
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
