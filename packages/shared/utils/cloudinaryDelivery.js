export function isCloudinaryUrl(value) {
  return (
    typeof value === 'string' &&
    /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//i.test(value)
  );
}

export function optimizeCloudinaryDeliveryUrl(value, { cloudNameFallback = '' } = {}) {
  if (!isCloudinaryUrl(value)) return value;

  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return value;

    if (cloudNameFallback && !parts[0]) {
      parts.unshift(cloudNameFallback);
    }

    const next = [...parts];
    const existingTransform = next[uploadIndex + 1] || '';
    const hasTransform =
      existingTransform.includes(',') ||
      /^(f_|q_|w_|h_|c_|dpr_|e_|g_)/.test(existingTransform);

    if (hasTransform) {
      if (!existingTransform.includes('f_auto')) next[uploadIndex + 1] += ',f_auto';
      if (!existingTransform.includes('q_auto')) next[uploadIndex + 1] += ',q_auto';
    } else {
      next.splice(uploadIndex + 1, 0, 'f_auto,q_auto');
    }

    url.pathname = `/${next.join('/')}`;
    return url.toString();
  } catch {
    return value;
  }
}
