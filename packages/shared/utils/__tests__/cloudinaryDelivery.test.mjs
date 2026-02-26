import test from 'node:test';
import assert from 'node:assert/strict';

import {
  optimizeCloudinaryDeliveryUrl,
  isCloudinaryUrl,
  parseCloudinaryUrl,
} from '../cloudinaryDelivery.js';

test('image URL without transforms gets f_auto,q_auto', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/v123/folder/pic.jpg';
  const output = optimizeCloudinaryDeliveryUrl(input);
  assert.equal(
    output,
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v123/folder/pic.jpg'
  );
});

test('video URL without transforms gets f_auto:video,q_auto', () => {
  const input = 'https://res.cloudinary.com/demo/video/upload/v123/folder/clip.mp4';
  const output = optimizeCloudinaryDeliveryUrl(input);
  assert.equal(
    output,
    'https://res.cloudinary.com/demo/video/upload/f_auto:video,q_auto/v123/folder/clip.mp4'
  );
});

test('adds missing f_auto when q_auto exists', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/q_auto/v5/folder/photo.png';
  const output = optimizeCloudinaryDeliveryUrl(input);
  assert.equal(
    output,
    'https://res.cloudinary.com/demo/image/upload/q_auto,f_auto/v5/folder/photo.png'
  );
});

test('adds missing q_auto when f_auto exists', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/f_auto/v5/folder/photo.png';
  const output = optimizeCloudinaryDeliveryUrl(input);
  assert.equal(
    output,
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v5/folder/photo.png'
  );
});

test('unchanged when both f_auto and q_auto exist', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/w_500,f_auto,q_auto/v5/folder/photo.png';
  const output = optimizeCloudinaryDeliveryUrl(input);
  assert.equal(output, input);
});

test('non cloudinary URL unchanged', () => {
  const input = 'https://cdn.example.com/assets/photo.jpg';
  assert.equal(isCloudinaryUrl(input), false);
  assert.equal(optimizeCloudinaryDeliveryUrl(input), input);
});

test('preserves version and folder public_id', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/v123/a/b/c/my-photo.jpg';
  const parsed = parseCloudinaryUrl(input);
  assert.equal(parsed?.versionSegment, 'v123');
  assert.equal(parsed?.publicIdWithExt, 'a/b/c/my-photo.jpg');
  assert.equal(
    optimizeCloudinaryDeliveryUrl(input),
    'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto/v123/a/b/c/my-photo.jpg'
  );
});

test('signed URLs are left unchanged', () => {
  const input = 'https://res.cloudinary.com/demo/image/upload/s--abc123--/v999/folder/photo.png';
  assert.equal(optimizeCloudinaryDeliveryUrl(input), input);
});
