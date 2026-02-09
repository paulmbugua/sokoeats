import path from 'path';
import {
  uploadBuffer,
  uploadLocalFile,
  deleteObject,
  isR2Url,
  parseR2Url,
  presignGet,
} from './r2UploadService.js';
import {
  isLegacyCloudinaryUrl,
  resolveLegacyCloudinaryUrl,
} from '../utils/legacyCloudinary.js';

export async function uploadAssetFromFile({
  kind,
  ownerId,
  file,
  filename,
  contentType,
  cacheControl,
}) {
  if (!file) throw new Error('Missing file');

  if (file.buffer) {
    return uploadBuffer({
      kind,
      ownerId,
      buffer: file.buffer,
      filename: filename || file.originalname || 'upload.bin',
      contentType: contentType || file.mimetype || 'application/octet-stream',
      cacheControl,
    });
  }

  if (file.path) {
    return uploadLocalFile({
      kind,
      ownerId,
      filePath: file.path,
      filename: filename || file.originalname || path.basename(file.path),
      contentType: contentType || file.mimetype || 'application/octet-stream',
      cacheControl,
    });
  }

  throw new Error('File must include buffer or path');
}

export async function deleteAssetByUrl(url) {
  if (!url) return { deleted: false };
  if (isR2Url(url)) {
    return deleteObject({ url });
  }
  return { deleted: false };
}

export function resolveLegacyAssetUrl(value, opts = {}) {
  if (!value) return null;
  if (isLegacyCloudinaryUrl(value)) return value;
  if (/^https?:\/\//i.test(String(value))) return String(value);
  return resolveLegacyCloudinaryUrl(value, opts);
}

export async function maybePresign(url, expiresInSec = 900) {
  if (!url) return null;
  if (isR2Url(url)) {
    const parsed = parseR2Url(url);
    if (!parsed?.bucket || !parsed?.objectPath) return url;
    const signed = await presignGet({
      bucket: parsed.bucket,
      objectPath: parsed.objectPath,
      expiresInSec,
    });
    return signed.url;
  }
  return url;
}
