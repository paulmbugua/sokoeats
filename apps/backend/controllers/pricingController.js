import pool from '../config/db.js';
import { createPricingQuote, publicQuote } from '../services/pricingService.js';

export async function quoteOrder(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const quote = await createPricingQuote(client, { ...req.body, userId: req.auth.sub });
    await client.query('COMMIT');
    console.info('[SokoEats][Pricing] quote', { quoteId: quote.id, vendorId: quote.vendor_id, distanceKm: quote.distance_km, multiplier: quote.surge_multiplier, total: quote.total });
    res.status(201).json({ quote: publicQuote(quote) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally { client.release(); }
}
