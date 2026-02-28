// apps/backend/src/routes/catalogRoutes.js

import express from 'express';
import { getCategories, getServicesByCategory, getEstates } from '../controllers/catalogController.js';

const router = express.Router();

router.get('/categories', getCategories);
router.get('/categories/:id/services', getServicesByCategory);
router.get('/estates', getEstates);

export default router;
