import {
  buildOptimizedCloudinaryUrl,
  isCloudinaryUrl,
  optimizeCloudinaryDeliveryUrl,
  parseCloudinaryUrl,
} from '../../../packages/shared/utils/cloudinaryDelivery.js';

const LEGACY_CLOUD_NAME = String(
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || ''
).trim();

export function isLegacyCloudinaryUrl(value) {
  return isCloudinaryUrl(value);
}

export function buildLegacyCloudinaryUrl(publicId, opts = {}) {
  if (!LEGACY_CLOUD_NAME || !publicId) return null;
  const resourceType = opts.resourceType === 'video' ? 'video' : 'image';
  return buildOptimizedCloudinaryUrl({
    cloudName: LEGACY_CLOUD_NAME,
    resourceType,
    publicId: String(publicId).replace(/^\/+/, ''),
    width: opts.width,
    height: opts.height,
  });
}

export function resolveLegacyCloudinaryUrl(value, opts = {}) {
  if (!value || typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) {
    return optimizeCloudinaryDeliveryUrl(value, {
      width: opts.width,
      height: opts.height,
      resourceTypeHint: opts.resourceType,
      cloudNameFallback: LEGACY_CLOUD_NAME,
    });
  }
  return buildLegacyCloudinaryUrl(value, opts);
}

export function extractLegacyPublicId(url) {
  if (!isLegacyCloudinaryUrl(url)) return null;
  return parseCloudinaryUrl(url)?.publicId || null;
}
