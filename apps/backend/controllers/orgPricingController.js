// apps/backend/controllers/orgPricingController.js
import { getOrgPricingTable } from '../services/orgPricing.js';

export function getOrgPricing(req, res) {
  try {
    const currency = (req.query.currency || 'USD').toUpperCase();
    const table = getOrgPricingTable(currency);
    return res.json(table);
  } catch (e) {
    return res.status(400).json({ error: e?.message || 'Invalid request' });
  }
}
