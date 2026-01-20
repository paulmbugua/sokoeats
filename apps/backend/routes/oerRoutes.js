// apps/backend/routes/oerRoutes.js
import { Router } from 'express';
import multer from 'multer';

import {
  listCatalog,
  listOerVideos,
  wrapCatalogItem,
  getOerMeta,
  wrapBook,
} from '../controllers/oerController.js';

import {
  listCollections,
  getCollectionItems,
  listCourses,
  getCourse,
  getBook,
  listBooks,
} from '../controllers/oerCollectionsController.js';

import { uploadOerCover } from '../controllers/oerUploadController.js';
import authUser from '../middleware/authUser.js';
import authOptional from '../middleware/authOptional.js';
import { adminAuth } from '../middleware/adminAuth.js';

const r = Router();

/* ───────── Multer setup for cover uploads ───────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* ───────── Simple admin guard using authUser ───────── */
// assumes authUser sets req.user with a .role field
function requireAdmin(req, res, next) {
  const role = req.user?.role;
  if (!role || !['admin', 'superadmin'].includes(role)) {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

/* ───────── New cover upload endpoint ───────── */
// POST /api/oer/upload-cover  (file field: "file")
r.post(
  '/oer/upload-cover',
  authUser, // populate req.user
  adminAuth, // ensure admin/superadmin
  upload.single('file'), // field name must match frontend
  uploadOerCover,
);

/* -------------------- Catalog (flat items) -------------------- */
r.get('/oer/catalog', listCatalog); // ?type=video|text&subject=&provider=&limit=&offset=
r.get('/oer/videos', listOerVideos); // ?q=&provider=&subject=&limit=&offset=
r.get('/oer/books', listBooks); // ?q=&limit=&offset=

/* ---- Collections (playlists/library groupings) --------------- */
r.get('/oer/collections', listCollections);
r.get('/oer/collections/:idOrTitle/items', getCollectionItems);

/* ---- Courses (collections/books rendered as a course) -------- */
r.get('/oer/courses', listCourses);
r.get('/oer/courses/:idOrTitle', getCourse);
r.get('/oer/books/:idOrSlug', getBook);

/* ------------------------- Utilities -------------------------- */
// NOTE: keep the path as whatever your frontend calls.
// If your client currently posts to /oer/wrap-item, use that instead.
r.post('/oer/wrap', authUser, wrapCatalogItem); // body { slug }
r.post('/oer/wrap-book', authOptional, wrapBook); // body { idOrSlug }
r.get('/oer/meta/:courseId', authUser, getOerMeta); // license/flags for UI

export default r;
