import '../config/env.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createImageUpload } from '../services/r2Images.js';

const origin = process.argv[2] || 'http://127.0.0.1:5173';
const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/e0AAAAASUVORK5CYII=', 'base64');
let upload;
let attemptedUpload = false;

try {
  upload = await createImageUpload({ ownerUserId: `upload-check-${crypto.randomUUID()}`, filename: 'check.png', contentType: 'image/png' });
  const preflight = await fetch(upload.uploadUrl, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type,cache-control' },
    signal: AbortSignal.timeout(20000),
  });
  console.info('[R2 check] preflight', { status: preflight.status, origin: preflight.headers.get('access-control-allow-origin') });
  assert.ok(preflight.ok, `Preflight failed: HTTP ${preflight.status}`);
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
  assert.ok(preflight.headers.get('access-control-allow-methods')?.includes('PUT'));
  const allowedHeaders = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(allowedHeaders.includes('content-type') && allowedHeaders.includes('cache-control'));

  attemptedUpload = true;
  const result = await fetch(upload.uploadUrl, { method: 'PUT', headers: { ...upload.headers, Origin: origin }, body: image, signal: AbortSignal.timeout(20000) });
  console.info('[R2 check] upload', { status: result.status });
  assert.ok(result.ok, `Upload failed: HTTP ${result.status}`);
  assert.equal(result.headers.get('access-control-allow-origin'), origin);

  const stored = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_IMAGES, Key: upload.key }));
  assert.deepEqual(Buffer.from(await stored.Body.transformToByteArray()), image);
  assert.equal(stored.ContentType, 'image/png');
  console.info('[R2 check] stored image verified', { bytes: image.length });
} catch (error) {
  // Do not print signed URLs, credentials, or provider request objects.
  console.error('[R2 check] failed', { name: error.name, message: error.message, status: error.$metadata?.httpStatusCode });
  process.exitCode = 1;
} finally {
  if (attemptedUpload) {
    try {
      await client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_IMAGES, Key: upload.key }));
      console.info('[R2 check] test object deleted');
    } catch (error) {
      console.error('[R2 check] cleanup failed', { key: upload.key, name: error.name, status: error.$metadata?.httpStatusCode });
      process.exitCode = 1;
    }
  }
  client.destroy();
}
