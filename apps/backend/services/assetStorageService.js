import { uploadLocalFile, uploadBuffer, deleteObject } from './r2UploadService.js';
import uploadToLocal from '../utils/uploadToLocal.js';

export async function uploadAssetFromFile({
  kind = 'image',
  ownerId = 'profile',
  file,
  filename,
  contentType,
}) {
  if (file?.buffer) {
    try {
      return await uploadBuffer({
        kind,
        ownerId,
        buffer: file.buffer,
        filename: filename || file.originalname,
        contentType: contentType || file.mimetype,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'production') throw error;
      console.warn('[uploads] R2 unavailable; using local development storage:', error?.Code || error?.message);
      const [local] = await uploadToLocal({
        buffer: file.buffer,
        originalname: filename || file.originalname || 'upload.bin',
      });
      return { ...local, provider: 'local' };
    }
  }
  if (!file?.path) throw new Error('Upload is missing both buffer and path');
  return uploadLocalFile({
    kind,
    ownerId,
    filePath: file.path,
    filename: filename || file.originalname,
    contentType: contentType || file.mimetype,
  });
}

export async function deleteAssetByUrl(url) {
  if (!url) return { deleted: false };
  return deleteObject({ url });
}
