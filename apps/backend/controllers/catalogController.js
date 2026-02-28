// apps/backend/src/controllers/catalogController.js

import { db } from '../db/memoryDb.js';

export const getCategories = async (_req, res) => {
  const s = db();
  return res.status(200).json({ categories: s.categories });
};

export const getServicesByCategory = async (req, res) => {
  const categoryId = String(req.params.id || '').trim();
  const s = db();
  const services = s.services.filter((x) => x.categoryId === categoryId);
  return res.status(200).json({ services });
};

export const getEstates = async (req, res) => {
  const city = String(req.query.city || 'Nairobi');
  const s = db();
  return res.status(200).json({ estates: s.estates.filter((e) => e.city === city) });
};
