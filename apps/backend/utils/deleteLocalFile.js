// apps/backend/utils/deleteLocalFile.js

import fs from 'fs';
import path from 'path';

// if you still need baseUrl logic, keep it; otherwise you can omit these two lines
const baseUrl =
  process.env.NODE_ENV === 'production'
    ? process.env.PROD_BACKEND_URL
    : process.env.BACKEND_URL;

const deleteLocalFile = async (fileUrl) => {
  try {
    // 1) Strip off your baseUrl if they passed an absolute URL
    let rel = fileUrl;
    if (baseUrl && rel.startsWith(baseUrl)) {
      rel = rel.slice(baseUrl.length);
    }

    // 2) Drop any leading slash(es)
    rel = rel.replace(/^\/+/, '');

    // 3) Decode percent-encodings
    rel = decodeURIComponent(rel);

    // 4) Build the absolute path into your "uploads" folder
    //    Adjust this if your uploads live somewhere else
    const uploadDir = path.join(process.cwd(), 'uploads');
    // If the URL was "uploads/foo.pdf" or just "foo.pdf", we strip any "uploads/" prefix
    const filename = rel.replace(/^uploads\//, '');
    const absPath = path.join(uploadDir, filename);

    // 5) Delete (or skip if not found)
    await fs.promises.unlink(absPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      // already gone, not a fatal error
      console.warn(`deleteLocalFile: file not found, skipping: ${fileUrl}`);
      return;
    }
    console.error(`deleteLocalFile: error deleting ${fileUrl}:`, err);
    throw err;
  }
};

export default deleteLocalFile;
