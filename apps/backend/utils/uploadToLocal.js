// apps/backend/utils/uploadToLocal.js

import fs from 'fs';
import path from 'path';

/**
 * Save one or more file buffers to disk under /uploads,
 * returning an array of { url, fileName } objects.
 *
 * Accepts either:
 *  - An array of objects with { buffer: Buffer, originalname: string }
 *  - A single Buffer (plus a fallback filename as second arg)
 *  - A single object with .buffer and .originalname
 *
 * @param {Buffer|{ buffer: Buffer, originalname: string }|Array} input
 * @param {string} [fallbackName]  Filename to use if input is a raw Buffer
 */
const uploadToLocal = async (input, fallbackName) => {
  const uploadsDir = path.join(process.cwd(), 'uploads');

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Normalize to an array of { buffer, originalname }
  const files = Array.isArray(input)
    ? input
    : [
        {
          buffer: Buffer.isBuffer(input) ? input : input.buffer,
          originalname: input.originalname || fallbackName,
        },
      ];

  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      if (!file || !file.buffer) {
        return reject(new Error('Missing file buffer'));
      }
      if (!file.originalname) {
        return reject(new Error('Missing original filename'));
      }

      const timestamp = Date.now();
      const safeName = file.originalname.replace(/\s+/g, '_');
      const uniqueFileName = `${timestamp}-${safeName}`;
      const filePath = path.join(uploadsDir, uniqueFileName);

      fs.writeFile(filePath, file.buffer, (err) => {
        if (err) return reject(err);
        // Return only the relative URL and stored filename
        resolve({
          url: `/uploads/${encodeURIComponent(uniqueFileName)}`,
          fileName: uniqueFileName,
        });
      });
    });
  });

  return Promise.all(uploadPromises);
};

export default uploadToLocal;
