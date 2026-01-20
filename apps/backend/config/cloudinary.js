// apps/backend/config/Cloudinary.js
import { v2 as cloudinary } from 'cloudinary';

const pick = (v) => (v ?? '').trim() || undefined;

export default function connectCloudinary() {
  // Pull explicit vars and trim them
  const EXPLICIT_NAME =
    pick(process.env.CLOUDINARY_CLOUD_NAME) ||
    pick(process.env.CLOUDINARY_NAME);
  const EXPLICIT_KEY = pick(process.env.CLOUDINARY_API_KEY);
  const EXPLICIT_SECRET =
    pick(process.env.CLOUDINARY_API_SECRET) ||
    pick(process.env.CLOUDINARY_SECRET_KEY);

  // Configure — the SDK will also auto-read CLOUDINARY_URL if fields are undefined
  cloudinary.config({
    cloud_name: EXPLICIT_NAME, // may be undefined; then SDK uses CLOUDINARY_URL
    api_key: EXPLICIT_KEY,
    api_secret: EXPLICIT_SECRET,
    secure: true,
    // You don't need global auth_token here; we mint short-lived tokens per request when needed
  });

  // After config, sanitize one more time (guards accidental whitespace)
  const cfg = cloudinary.config() || {};
  if (/\s/.test(cfg.cloud_name || '')) {
    console.warn(
      '[cloudinary] WARNING: cloud_name had whitespace:',
      JSON.stringify(cfg.cloud_name),
    );
    cloudinary.config({ cloud_name: (cfg.cloud_name || '').trim() });
  }

  const finalCfg = cloudinary.config();
  if (!finalCfg.cloud_name || !String(finalCfg.cloud_name).trim()) {
    throw new Error(
      'Cloudinary cloud_name is missing or invalid. Set CLOUDINARY_CLOUD_NAME and restart the server.',
    );
  }
  console.log('[cloudinary] configured', {
    cloud_name: finalCfg.cloud_name,
    has_api_key: !!finalCfg.api_key,
    has_api_secret: !!finalCfg.api_secret,
  });
}
