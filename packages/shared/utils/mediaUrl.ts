import { optimizeCloudinaryDeliveryUrl } from './cloudinaryDelivery.js';

export function optimizeMediaUrl(url?: string, opts?: { width?: number; height?: number; resourceTypeHint?: 'image' | 'video' }) {
  if (!url) return url || '';
  return optimizeCloudinaryDeliveryUrl(url, opts);
}
