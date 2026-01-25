import path from 'path';
import { createReadStream } from 'fs';
import { v4 as uuid } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Full videos are private (R2_BUCKET_VIDEOS)
// Previews/thumbs are public (R2_BUCKET_PREVIEWS + R2_PUBLIC_BASE_URL_PREVIEWS)
const REQUIRED_ENVS = [
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_VIDEOS',
  'R2_BUCKET_PREVIEWS',
  'R2_PUBLIC_BASE_URL_PREVIEWS',
];

const R2_PUBLIC_BASE_URL_PREVIEWS = String(
  process.env.R2_PUBLIC_BASE_URL_PREVIEWS || ''
).replace(/\/+$/, '');

const BACKEND_PUBLIC_BASE_URL = String(
  process.env.BACKEND_PUBLIC_BASE_URL || process.env.BACKEND_URL || ''
).replace(/\/+$/, '');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getR2Client() {
  const endpoint = requireEnv('R2_ENDPOINT');
  const region = process.env.R2_REGION || 'auto';
  const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');

  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function sanitizeFilename(input = 'upload.bin') {
  const trimmed = String(input || '').trim();
  const ext = path.extname(trimmed).replace(/[^a-zA-Z0-9.]/g, '');
  const base = path
    .basename(trimmed, ext)
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const safeBase = base || 'file';
  return `${safeBase}${ext}`;
}

function buildObjectPath({ kind, ownerId, filename, now = new Date() }) {
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = sanitizeFilename(filename);
  const unique = uuid();
  return `${kind}/${ownerId}/${year}/${month}/${unique}-${safeName}`;
}

// Decide bucket by kind
function getBucketForKind(kind) {
  const k = String(kind || '').toLowerCase();
  if (k === 'preview' || k === 'thumb' || k === 'thumbnail') {
    return requireEnv('R2_BUCKET_PREVIEWS');
  }
  return requireEnv('R2_BUCKET_VIDEOS');
}

// Only previews/thumbs get a direct public URL
function resolvePublicUrl({ bucket, objectPath, kind }) {
  const k = String(kind || '').toLowerCase();

  if (k === 'preview' || k === 'thumb' || k === 'thumbnail') {
    if (!R2_PUBLIC_BASE_URL_PREVIEWS) {
      throw new Error('Missing R2_PUBLIC_BASE_URL_PREVIEWS');
    }
    return `${R2_PUBLIC_BASE_URL_PREVIEWS}/${objectPath}`;
  }

  // Private assets: store a backend proxy URL if you want
  // (your download endpoint should presign and return the real signed URL)
  if (BACKEND_PUBLIC_BASE_URL) {
    return `${BACKEND_PUBLIC_BASE_URL}/media/${bucket}/${objectPath}`;
  }

  throw new Error(
    'Full videos are private: no public URL. Use presignGet via download endpoint.'
  );
}

// Detect if url is from R2 (preview public domain or backend proxy)
function detectUploadProvider(url) {
  if (!url || typeof url !== 'string') return null;
  if (/cloudinary\.com/i.test(url)) return 'cloudinary';

  const previewBase = R2_PUBLIC_BASE_URL_PREVIEWS;
  if (previewBase && url.startsWith(`${previewBase}/`)) return 'r2';

  if (BACKEND_PUBLIC_BASE_URL && url.startsWith(`${BACKEND_PUBLIC_BASE_URL}/media/`)) return 'r2';

  if (/\/media\/.+\/.+/i.test(url)) return 'r2';

  return null;
}

// Parse R2 URLs into { bucket, objectPath }
function parseR2Url(url) {
  if (!url || typeof url !== 'string') return null;

  const previewBase = R2_PUBLIC_BASE_URL_PREVIEWS;
  if (previewBase && url.startsWith(`${previewBase}/`)) {
    const objectPath = url.slice(previewBase.length + 1);
    const bucket = process.env.R2_BUCKET_PREVIEWS || '';
    return { bucket, objectPath };
  }

  const backendBase = BACKEND_PUBLIC_BASE_URL;
  if (backendBase && url.startsWith(`${backendBase}/media/`)) {
    const rest = url.slice(`${backendBase}/media/`.length);
    const [bucket, ...parts] = rest.split('/');
    return { bucket, objectPath: parts.join('/') };
  }

  const mediaIdx = url.indexOf('/media/');
  if (mediaIdx !== -1) {
    const rest = url.slice(mediaIdx + '/media/'.length);
    const [bucket, ...parts] = rest.split('/');
    return { bucket, objectPath: parts.join('/') };
  }

  return null;
}

export async function presignPut({ kind, filename, contentType, sizeBytes, ownerId }) {
  REQUIRED_ENVS.forEach(requireEnv);

  const bucket = getBucketForKind(kind);
  const objectPath = buildObjectPath({ kind, ownerId, filename });
  const client = getR2Client();

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectPath,
    ContentType: contentType,
  });

  const expiresInSec = Number(process.env.R2_PRESIGN_EXPIRES_SEC || 900);
  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSec });

  return {
    bucket,
    objectPath,
    uploadUrl,
    headers: { 'Content-Type': contentType },
    expiresInSec,
    sizeBytes,
  };
}

export function finalize({ bucket, objectPath, kind }) {
  return { url: resolvePublicUrl({ bucket, objectPath, kind }) };
}

export async function presignGet({ bucket, objectPath, expiresInSec = 60 }) {
  REQUIRED_ENVS.forEach(requireEnv);

  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: objectPath,
  });

  const url = await getSignedUrl(client, command, { expiresIn: expiresInSec });
  return { url, expiresInSec };
}

export async function deleteObject({ bucket, objectPath, url }) {
  REQUIRED_ENVS.forEach(requireEnv);

  let targetBucket = bucket;
  let targetPath = objectPath;

  if ((!targetBucket || !targetPath) && url) {
    const parsed = parseR2Url(url);
    if (parsed) {
      targetBucket = parsed.bucket;
      targetPath = parsed.objectPath;
    }
  }

  if (!targetBucket || !targetPath) return { deleted: false };

  const client = getR2Client();
  const command = new DeleteObjectCommand({ Bucket: targetBucket, Key: targetPath });
  await client.send(command);
  return { deleted: true };
}

export async function uploadLocalFile({ kind, ownerId, filePath, filename, contentType }) {
  REQUIRED_ENVS.forEach(requireEnv);

  const bucket = getBucketForKind(kind);
  const objectPath = buildObjectPath({
    kind,
    ownerId,
    filename: filename || path.basename(filePath),
  });

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectPath,
    Body: createReadStream(filePath),
    ContentType: contentType,
  });

  await client.send(command);

  return {
    bucket,
    objectPath,
    url: resolvePublicUrl({ bucket, objectPath, kind }),
  };
}

export function isR2Url(url) {
  return detectUploadProvider(url) === 'r2';
}

export { detectUploadProvider, parseR2Url, resolvePublicUrl };
