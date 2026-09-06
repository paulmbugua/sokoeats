import crypto from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

function config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const endpoint = process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : null);
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_IMAGES;
  const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL_IMAGES || '').replace(/\/$/, '');
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl) {
    throw Object.assign(new Error('R2 image storage is not fully configured'), { status: 503 });
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket, publicBaseUrl };
}

function extension(filename, contentType) {
  const fromName = String(filename || '').toLowerCase().match(/\.(jpe?g|png|webp|avif)$/)?.[1];
  if (fromName) return fromName === 'jpeg' ? 'jpg' : fromName;
  return ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[contentType];
}

export async function createImageUpload({ ownerUserId, filename, contentType }) {
  if (!allowedTypes.has(contentType)) throw Object.assign(new Error('Upload a JPEG, PNG, WebP, or AVIF image'), { status: 422 });
  const settings = config();
  const key = `vendors/${ownerUserId}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extension(filename, contentType)}`;
  const client = new S3Client({
    region: 'auto',
    endpoint: settings.endpoint,
    // The browser supplies the body later; never sign an empty-body checksum.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
  });
  const headers = { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000, immutable' };
  try {
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({
      Bucket: settings.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: headers['Cache-Control'],
    }), { expiresIn: 600, signableHeaders: new Set(['content-type', 'cache-control']) });
    return { key, uploadUrl, publicUrl: `${settings.publicBaseUrl}/${key}`, headers, expiresInSeconds: 600 };
  } finally { client.destroy(); }
}
