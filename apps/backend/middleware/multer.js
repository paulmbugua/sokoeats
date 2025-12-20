import multer from 'multer';

// ✅ **Define Allowed File Types**
const allowedFileTypes = new Set(['application/pdf']);

// ✅ **Configure Multer Storage (Memory)**
const storage = multer.memoryStorage(); // Store files in memory buffer

// ✅ **Configure File Filter for Validation**
const fileFilter = (req, file, callback) => {
  const mime = file.mimetype || '';
  if (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    allowedFileTypes.has(mime)
  ) {
    callback(null, true);
  } else {
    callback(
      new Error('Invalid file type. Allowed: PNG, JPG, WEBP, GIF, MP4, PDF'),
    );
  }
};

// ✅ **Configure Multer Upload Settings**
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // Max file size: 100MB
  },
});

// ✅ **Exports**
export default upload;
