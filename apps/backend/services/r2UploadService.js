// apps/backend/services/r2UploadService.js
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

const REQUIRED_ENVS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_VIDEOS'];

const R2_PUBLIC_BASE_URL = String(process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '');
const BACKEND_PUBLIC_BASE_URL = String(
  process.env.BACKEND_PUBLIC_BASE_URL || process.env.BACKEND_URL || ''
).replace(/\/+$/, '');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
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

function getDefaultBucket() {
  return requireEnv('R2_BUCKET_VIDEOS');
}

function resolvePublicUrl({ bucket, objectPath }) {
  if (R2_PUBLIC_BASE_URL) {
    return `${R2_PUBLIC_BASE_URL}/${objectPath}`;
  }
  if (BACKEND_PUBLIC_BASE_URL) {
    return `${BACKEND_PUBLIC_BASE_URL}/media/${bucket}/${objectPath}`;
  }
  throw new Error('Missing BACKEND_PUBLIC_BASE_URL (or R2_PUBLIC_BASE_URL) for media URLs.');
}

function detectUploadProvider(url) {
  if (!url || typeof url !== 'string') return null;
  if (/cloudinary\.com/i.test(url)) return 'cloudinary';

  const publicBase = R2_PUBLIC_BASE_URL;
  if (publicBase && url.startsWith(`${publicBase}/`)) return 'r2';

  if (BACKEND_PUBLIC_BASE_URL && url.startsWith(`${BACKEND_PUBLIC_BASE_URL}/media/`)) return 'r2';

  if (/\/media\/.+\/.+/i.test(url)) return 'r2';

  return null;
}

function parseR2Url(url) {
  if (!url || typeof url !== 'string') return null;
  const bucketFallback = process.env.R2_BUCKET_VIDEOS || '';

  const publicBase = R2_PUBLIC_BASE_URL;
  if (publicBase && url.startsWith(`${publicBase}/`)) {
    const objectPath = url.slice(publicBase.length + 1);
    return { bucket: bucketFallback, objectPath };
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

  const bucket = getDefaultBucket();
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

export function finalize({ bucket, objectPath }) {
  return { url: resolvePublicUrl({ bucket, objectPath }) };
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

  if (!targetBucket || !targetPath) {
    return { deleted: false };
  }

  const client = getR2Client();
  const command = new DeleteObjectCommand({ Bucket: targetBucket, Key: targetPath });
  await client.send(command);
  return { deleted: true };
}

export async function uploadLocalFile({ kind, ownerId, filePath, filename, contentType }) {
  REQUIRED_ENVS.forEach(requireEnv);

  const bucket = getDefaultBucket();
  const objectPath = buildObjectPath({ kind, ownerId, filename: filename || path.basename(filePath) });
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
    url: resolvePublicUrl({ bucket, objectPath }),
  };
}

export function isR2Url(url) {
  return detectUploadProvider(url) === 'r2';
}

export { detectUploadProvider, parseR2Url, resolvePublicUrl };
