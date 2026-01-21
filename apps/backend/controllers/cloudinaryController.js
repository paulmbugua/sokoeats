// controllers/cloudinaryController.js
import { v2 as cloudinary } from 'cloudinary';

const pick = (v) => (v ?? '').trim() || '';

export const getDirectUploadSignature = async (req, res) => {
  try {
    const resourceType = String(req.body?.resourceType || 'image').toLowerCase();
    const folder = pick(req.body?.folder) || 'class_vault';
    const timestamp = Math.round(Date.now() / 1000);

    // Prefer the already-configured SDK secret (connectCloudinary ran at boot)
    const cfg = cloudinary.config() || {};
    const apiSecret =
      pick(cfg.api_secret) ||
      pick(process.env.CLOUDINARY_API_SECRET) ||
      pick(process.env.CLOUDINARY_SECRET_KEY);

    const apiKey =
      pick(cfg.api_key) ||
      pick(process.env.CLOUDINARY_API_KEY);

    const cloudName =
      pick(cfg.cloud_name) ||
      pick(process.env.CLOUDINARY_CLOUD_NAME) ||
      pick(process.env.CLOUDINARY_NAME);

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        message: 'Cloudinary is not configured (missing cloudName/apiKey/apiSecret).',
      });
    }

    const paramsToSign = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

    console.log('🎥 Cloudinary sign request:', {
      user: req.user?.id,
      resourceType,
      folder,
      timestamp,
      cloudName: JSON.stringify(cloudName),
      apiKey: apiKey ? `${apiKey.slice(0, 4)}…` : null,
    });

    res.json({
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
      resourceType,
    });
  } catch (err) {
    console.error('getDirectUploadSignature error:', err);
    res.status(500).json({ message: 'Failed to get signature.' });
  }
};
