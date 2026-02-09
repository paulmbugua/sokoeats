const LEGACY_CLOUD_NAME = String(
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || ''
).trim();

export function isLegacyCloudinaryUrl(value) {
  return typeof value === 'string' && /res\.cloudinary\.com/i.test(value);
}

export function buildLegacyCloudinaryUrl(publicId, opts = {}) {
  if (!LEGACY_CLOUD_NAME || !publicId) return null;
  const resourceType = opts.resourceType || 'image';
  const cleaned = String(publicId).replace(/^\/+/, '');
  return `https://res.cloudinary.com/${LEGACY_CLOUD_NAME}/${resourceType}/upload/${cleaned}`;
}

export function resolveLegacyCloudinaryUrl(value, opts = {}) {
  if (!value) return null;
  if (typeof value !== 'string') return null;
  if (/^https?:\/\//i.test(value)) return value;
  return buildLegacyCloudinaryUrl(value, opts);
}

export function extractLegacyPublicId(url) {
  if (!isLegacyCloudinaryUrl(url)) return null;
  const clean = url.split('?')[0];
  const parts = clean.split('/upload/');
  if (parts.length < 2) return null;
  let after = parts[1];
  after = after.replace(/^v\d+\//, '');
  return after.replace(/\.[^/.]+$/, '');
}
