// apps/backend/routes/searchRoutes.js
import { Router } from 'express';
import authOptional from '../middleware/authOptional.js';
import { unifiedSearch } from '../controllers/searchController.js';

const r = Router();

r.get('/search', authOptional, unifiedSearch);

export default r;
