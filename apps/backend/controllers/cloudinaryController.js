// controllers/cloudinaryController.js
import { v2 as cloudinary } from 'cloudinary';

/**
 * Returns a short-lived signature so the browser can upload
 * directly to Cloudinary without proxying big files through Node.
 *
 * Body (optional):
 *   { resourceType?: 'image' | 'video', folder?: string }
 */
export const getDirectUploadSignature = async (req, res) => {
  try {
    const resourceType = (req.body?.resourceType || 'image').toLowerCase();
    const folder = req.body?.folder || 'class_vault';
    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign = { timestamp, folder };
    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET,
    );

    // 🟢 Add debugging logs
    console.log('🎥 Cloudinary sign request:', {
      user: req.user?.id, // who is requesting the sign
      resourceType,
      folder,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });

    res.json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
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
