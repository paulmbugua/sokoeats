// apps/backend/controllers/oerUploadController.js
import cloudinary from '../services/cloudinaryShim.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB just as a safety guard

export async function uploadOerCover(req, res) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'file is required' });
    }

    if (!/^image\/(png|jpe?g)$/i.test(file.mimetype)) {
      return res
        .status(400)
        .json({ error: 'Only PNG or JPG images are allowed' });
    }

    if (file.size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: 'Image is too large (max 5MB)' });
    }

    // Wrap Cloudinary upload_stream in a Promise
    const url = await new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: 'oer-covers',
          resource_type: 'image',
          // Let Cloudinary detect format; optional: transformation, etc.
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result.secure_url || result.url);
        },
      );

      // req.file.buffer is available because we use memoryStorage
      upload.end(file.buffer);
    });

    return res.json({ ok: true, url });
  } catch (e) {
    console.error('[oer] uploadOerCover error', e);
    return res.status(500).json({ error: 'Failed to upload cover image' });
  }
}
