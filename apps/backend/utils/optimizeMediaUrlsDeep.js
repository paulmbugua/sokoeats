import { isCloudinaryUrl, optimizeCloudinaryDeliveryUrl } from '../../../packages/shared/utils/cloudinaryDelivery.js';

const MEDIA_KEY_RE = /(image|img|avatar|thumb|thumbnail|cover|logo|banner|video|poster|media|signature|certificate|asset|gallery|url)$/i;
const CLOUD_NAME = String(
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_CLOUD_NAME || ''
).trim();

let hasWarnedCloudNameMissing = false;

function shouldOptimizeKey(key) {
  return typeof key === 'string' && MEDIA_KEY_RE.test(key);
}

function optimizeString(value, key) {
  if (!isCloudinaryUrl(value)) return value;

  if (!CLOUD_NAME && !hasWarnedCloudNameMissing) {
    hasWarnedCloudNameMissing = true;
    console.warn('[media-opt] Cloudinary URL detected but CLOUDINARY_CLOUD_NAME is missing.');
  }

  const optimized = optimizeCloudinaryDeliveryUrl(value, { cloudNameFallback: CLOUD_NAME });
  if (optimized !== value) {
    console.debug?.('[media-opt] optimized cloudinary delivery URL');
  }
  return optimized;
}

export function optimizeMediaUrlsDeep(input, keyHint) {
  if (typeof input === 'string') {
    if (!keyHint) return optimizeString(input, keyHint);
    return shouldOptimizeKey(keyHint) ? optimizeString(input, keyHint) : input;
  }

  if (Array.isArray(input)) {
    return input.map((entry) => optimizeMediaUrlsDeep(entry, keyHint));
  }

  if (!input || typeof input !== 'object') return input;

  const out = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = optimizeMediaUrlsDeep(value, key);
  }
  return out;
}

export function installCloudinaryResponseOptimizer() {
  return function cloudinaryResponseOptimizer(_req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      const optimized = optimizeMediaUrlsDeep(payload);
      return originalJson(optimized);
    };
    next();
  };
}
