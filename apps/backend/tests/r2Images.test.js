import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageUpload } from '../services/r2Images.js';

test('browser image upload signs matching headers without an empty-body checksum', async () => {
  const values = { R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com', R2_ACCESS_KEY_ID: 'test-access-key', R2_SECRET_ACCESS_KEY: 'test-secret-not-a-real-credential', R2_BUCKET_IMAGES: 'test-images', R2_PUBLIC_BASE_URL_IMAGES: 'https://images.example.invalid' };
  const original = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    const upload = await createImageUpload({ ownerUserId: 'test-owner', filename: 'food.jpg', contentType: 'image/jpeg' });
    const url = new URL(upload.uploadUrl);
    assert.ok(![...url.searchParams.keys()].some(key => key.toLowerCase().includes('checksum')));
    assert.equal(upload.headers['Content-Type'], 'image/jpeg');
    assert.ok(upload.headers['Cache-Control'].includes('immutable'));
    assert.ok(url.searchParams.get('X-Amz-SignedHeaders').includes('content-type'));
    assert.ok(url.searchParams.get('X-Amz-SignedHeaders').includes('cache-control'));
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600');
    await assert.rejects(() => createImageUpload({ ownerUserId: 'test', filename: 'file.html', contentType: 'text/html' }), error => error.status === 422);
  } finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
});
