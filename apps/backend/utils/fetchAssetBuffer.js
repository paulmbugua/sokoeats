import fetch from 'node-fetch';
import { resolveLegacyCloudinaryUrl } from './legacyCloudinary.js';

export async function fetchAssetBuffer(source, opts = {}) {
  if (!source) return null;
  const resourceType = opts.resourceType || 'image';
  const url = resolveLegacyCloudinaryUrl(source, { resourceType }) || String(source);
  if (!/^https?:\/\//i.test(url)) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}
