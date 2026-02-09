import path from 'path';
import { createReadStream } from 'fs';
import { v4 as uuid } from 'uuid';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const REQUIRED_ENVS = ['R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];

const BACKEND_PUBLIC_BASE_URL = String(
  process.env.BACKEND_PUBLIC_BASE_URL || process.env.BACKEND_URL || ''
).replace(/\/+$/, '');

const ASSET_CONFIG = {
  video: { bucketEnv: 'R2_BUCKET_VIDEOS', public: false },
  preview: {
    bucketEnv: 'R2_BUCKET_PREVIEWS',
    public: true,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_PREVIEWS',
  },
  thumbnail: {
    bucketEnv: 'R2_BUCKET_PREVIEWS',
    public: true,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_PREVIEWS',
  },
  image: {
    bucketEnv: 'R2_BUCKET_IMAGES',
    public: true,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_IMAGES',
  },
  avatar: {
    bucketEnv: 'R2_BUCKET_IMAGES',
    public: true,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_IMAGES',
  },
  banner: {
    bucketEnv: 'R2_BUCKET_IMAGES',
    public: true,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_IMAGES',
  },
  audio: {
    bucketEnv: 'R2_BUCKET_AUDIO',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_AUDIO',
  },
  tts: {
    bucketEnv: 'R2_BUCKET_AUDIO',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_AUDIO',
  },
  doc: {
    bucketEnv: 'R2_BUCKET_DOCS',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_DOCS',
  },
  pdf: {
    bucketEnv: 'R2_BUCKET_DOCS',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_DOCS',
  },
  ai: {
    bucketEnv: 'R2_BUCKET_AI',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_AI',
  },
  transcript: {
    bucketEnv: 'R2_BUCKET_AI',
    public: false,
    publicBaseEnv: 'R2_PUBLIC_BASE_URL_AI',
  },
};

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

function resolveKind(kind = 'video') {
  const k = String(kind || '').toLowerCase();
  if (k === 'thumb') return 'thumbnail';
  return k;
}

function getConfigForKind(kind) {
  const key = resolveKind(kind);
  const config = ASSET_CONFIG[key] || ASSET_CONFIG.video;
  return { key, config };
}

function buildObjectPath({ kind, ownerId, filename, now = new Date() }) {
  const { key } = getConfigForKind(kind);
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeName = sanitizeFilename(filename);
  const unique = uuid();
  const safeOwner = ownerId || 'system';
  return `${key}/${safeOwner}/${year}/${month}/${unique}-${safeName}`;
}

// Decide bucket by kind
function getBucketForKind(kind) {
  const { config } = getConfigForKind(kind);
  return requireEnv(config.bucketEnv);
}

// Only previews/thumbs get a direct public URL
function resolvePublicUrl({ bucket, objectPath, kind }) {
  const { key, config } = getConfigForKind(kind);
  const baseUrl = String(process.env[config.publicBaseEnv || ''] || '').replace(/\/+$/, '');

  if (config.public && baseUrl) {
    return `${baseUrl}/${objectPath}`;
  }

  if (config.public && !baseUrl && BACKEND_PUBLIC_BASE_URL) {
    return `${BACKEND_PUBLIC_BASE_URL}/media/${bucket}/${objectPath}`;
  }

  if (BACKEND_PUBLIC_BASE_URL) {
    return `${BACKEND_PUBLIC_BASE_URL}/media/${bucket}/${objectPath}`;
  }

  throw new Error(`Asset ${key} is private: no public URL configured.`);
}

// Detect if url is from R2 (preview public domain or backend proxy)
function detectUploadProvider(url) {
  if (!url || typeof url !== 'string') return null;
  if (/cloudinary\.com/i.test(url)) return 'cloudinary';

  for (const cfg of Object.values(ASSET_CONFIG)) {
    const base = String(process.env[cfg.publicBaseEnv || ''] || '').replace(/\/+$/, '');
    if (base && url.startsWith(`${base}/`)) return 'r2';
  }

  if (BACKEND_PUBLIC_BASE_URL && url.startsWith(`${BACKEND_PUBLIC_BASE_URL}/media/`)) return 'r2';

  if (/\/media\/.+\/.+/i.test(url)) return 'r2';

  return null;
}

// Parse R2 URLs into { bucket, objectPath }
function parseR2Url(url) {
  if (!url || typeof url !== 'string') return null;

  for (const cfg of Object.values(ASSET_CONFIG)) {
    const base = String(process.env[cfg.publicBaseEnv || ''] || '').replace(/\/+$/, '');
    if (base && url.startsWith(`${base}/`)) {
      const objectPath = url.slice(base.length + 1);
      const bucket = process.env[cfg.bucketEnv] || '';
      return { bucket, objectPath };
    }
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

export async function uploadLocalFile({ kind, ownerId, filePath, filename, contentType, cacheControl }) {
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
    CacheControl: cacheControl,
  });

  await client.send(command);

  return {
    bucket,
    objectPath,
    url: resolvePublicUrl({ bucket, objectPath, kind }),
  };
}

export async function uploadBuffer({
  kind,
  ownerId,
  buffer,
  filename,
  contentType,
  cacheControl,
}) {
  REQUIRED_ENVS.forEach(requireEnv);

  const bucket = getBucketForKind(kind);
  const objectPath = buildObjectPath({
    kind,
    ownerId,
    filename: filename || 'upload.bin',
  });

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectPath,
    Body: buffer,
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  await client.send(command);

  return {
    bucket,
    objectPath,
    url: resolvePublicUrl({ bucket, objectPath, kind }),
  };
}

export async function putObject({
  bucket,
  objectPath,
  body,
  contentType,
  cacheControl,
}) {
  REQUIRED_ENVS.forEach(requireEnv);
  if (!bucket || !objectPath) throw new Error('bucket and objectPath are required');

  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectPath,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  });

  await client.send(command);
  return { bucket, objectPath };
}

export async function headObject({ bucket, objectPath }) {
  REQUIRED_ENVS.forEach(requireEnv);
  const client = getR2Client();
  const command = new HeadObjectCommand({ Bucket: bucket, Key: objectPath });
  return client.send(command);
}

export function isR2Url(url) {
  return detectUploadProvider(url) === 'r2';
}

export { detectUploadProvider, parseR2Url, resolvePublicUrl, getBucketForKind, resolveKind };
