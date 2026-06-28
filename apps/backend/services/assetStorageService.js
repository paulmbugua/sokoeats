import { uploadLocalFile, deleteObject } from './r2UploadService.js';

export async function uploadAssetFromFile({
  kind = 'image',
  ownerId = 'profile',
  file,
  filename,
  contentType,
}) {
  if (!file?.path) throw new Error('file.path is required');
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
