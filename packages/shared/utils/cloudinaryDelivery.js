/**
 * Cloudinary delivery optimizer
 *
 * Legacy assets stored on Cloudinary should be delivered with URL transformations
 * so Cloudinary can auto-select modern formats + quality at request time.
 * Required defaults:
 *  - images: f_auto,q_auto
 *  - videos: f_auto:video,q_auto
 */

const CLOUDINARY_HOST_RE = /(^|\.)res\.cloudinary\.com$/i;
const SIGNATURE_SEGMENT_RE = /^s--[^/]+--$/;

function safeParseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function normalizePublicId(publicId) {
  return String(publicId || '').replace(/^\/+/, '');
}

function splitTransformTokens(transformations) {
  if (!transformations) return [];
  return transformations
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function isCloudinaryUrl(url) {
  if (typeof url !== 'string' || !url) return false;
  const parsed = safeParseUrl(url);
  return !!parsed && CLOUDINARY_HOST_RE.test(parsed.hostname);
}

export function parseCloudinaryUrl(url) {
  const parsed = safeParseUrl(url);
  if (!parsed || !CLOUDINARY_HOST_RE.test(parsed.hostname)) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 4) return null;

  const [cloudName, resourceType, deliveryType] = segments;
  if (!cloudName || !resourceType || !deliveryType) return null;

  let cursor = 3;
  let signature;
  if (SIGNATURE_SEGMENT_RE.test(segments[cursor] || '')) {
    signature = segments[cursor];
    cursor += 1;
  }

  let transformations = '';
  const current = segments[cursor];
  if (current && !/^v\d+$/.test(current)) {
    transformations = current;
    cursor += 1;
  }

  const versionSegment = segments[cursor] && /^v\d+$/.test(segments[cursor]) ? segments[cursor++] : undefined;
  const publicIdWithExt = segments.slice(cursor).join('/');
  if (!publicIdWithExt) return null;

  const publicId = publicIdWithExt.replace(/\.[^/.?#]+$/, '');

  return {
    cloudName,
    resourceType,
    deliveryType,
    signature,
    transformations,
    versionSegment,
    publicIdWithExt,
    publicId,
  };
}

export function buildOptimizedCloudinaryUrl(args) {
  const {
    cloudName,
    resourceType,
    publicId,
    formatHint,
    width,
    height,
    crop = 'limit',
    quality = 'auto',
    format,
  } = args || {};

  if (!cloudName || !publicId || !['image', 'video'].includes(resourceType)) return '';

  const fmt = format || (resourceType === 'video' ? 'auto:video' : 'auto');
  const transforms = [];

  if (Number.isFinite(width) && Number(width) > 0) transforms.push(`w_${Math.round(Number(width))}`);
  if (Number.isFinite(height) && Number(height) > 0) transforms.push(`h_${Math.round(Number(height))}`);
  if (transforms.length > 0) transforms.push(`c_${crop || 'limit'}`);

  transforms.push(`f_${fmt}`);
  transforms.push(`q_${quality ?? 'auto'}`);

  const normalized = normalizePublicId(publicId);
  const ext = formatHint ? `.${String(formatHint).replace(/^\./, '')}` : '';
  return `https://res.cloudinary.com/${cloudName}/${resourceType}/upload/${transforms.join(',')}/${normalized}${ext}`;
}

function ensureRequiredTokens(tokens, resourceType, opts = {}) {
  const next = [...tokens];
  const hasToken = (prefix) => next.some((token) => token === prefix || token.startsWith(`${prefix}_`) || token.startsWith(`${prefix}:`));

  if (resourceType === 'video') {
    if (!next.includes('f_auto:video')) next.push('f_auto:video');
  } else if (!hasToken('f')) {
    next.push('f_auto');
  }

  if (!hasToken('q')) next.push('q_auto');

  if ((opts.width || opts.height) && !next.some((token) => /^c_/.test(token))) {
    next.push('c_limit');
  }
  if (opts.width && !next.some((token) => /^w_/.test(token))) {
    next.push(`w_${Math.round(opts.width)}`);
  }
  if (opts.height && !next.some((token) => /^h_/.test(token))) {
    next.push(`h_${Math.round(opts.height)}`);
  }

  return next;
}

export function optimizeCloudinaryDeliveryUrl(inputUrl, opts = {}) {
  if (!isCloudinaryUrl(inputUrl)) return inputUrl;
  const details = parseCloudinaryUrl(inputUrl);
  if (!details) return inputUrl;
  if (details.signature) return inputUrl;
  if (details.deliveryType !== 'upload') return inputUrl;

  const parsed = safeParseUrl(inputUrl);
  if (!parsed) return inputUrl;

  const resolvedType = details.resourceType === 'video' || opts.resourceTypeHint === 'video' ? 'video' : 'image';
  const tokens = splitTransformTokens(details.transformations);
  const optimizedTokens = ensureRequiredTokens(tokens, resolvedType, opts);
  const transformSegment = optimizedTokens.join(',');

  const segments = parsed.pathname.split('/').filter(Boolean);
  let cursor = 3;
  const rebuilt = [segments[0], segments[1], segments[2]];

  if (SIGNATURE_SEGMENT_RE.test(segments[cursor] || '')) {
    return inputUrl;
  }

  const hadTransform = segments[cursor] && !/^v\d+$/.test(segments[cursor]);
  if (hadTransform) cursor += 1;
  rebuilt.push(transformSegment);

  if (segments[cursor] && /^v\d+$/.test(segments[cursor])) {
    rebuilt.push(segments[cursor]);
    cursor += 1;
  }

  rebuilt.push(...segments.slice(cursor));
  parsed.pathname = `/${rebuilt.join('/')}`;
  return parsed.toString();
}
