// apps/backend/controllers/orgPricingController.js
import { getOrgPricingTableAsync } from '../services/orgPricing.js';

export async function getOrgPricing(req, res) {
  try {
    const currency = String(req.query.currency || 'USD').toUpperCase();
    const table = await getOrgPricingTableAsync(currency);
    return res.json(table);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid request' });
  }
}
