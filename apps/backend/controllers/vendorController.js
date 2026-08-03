import pool from '../config/db.js';
export async function createVendor(req, res, next) {
  try {
    const { name, slug, cuisine, status, prepMinutes, deliveryFee, minimumOrder, address } = req.body;
    const { rows } = await pool.query(`INSERT INTO sokoeats_vendors (name, slug, cuisine, status, prep_minutes, delivery_fee, minimum_order, address) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [name, slug, cuisine, status, prepMinutes, deliveryFee, minimumOrder, address || null]);
    res.status(201).json({ vendor: rows[0] });
  } catch (err) { next(err); }
}
export async function vendorDashboard(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT v.id, v.name, COUNT(o.id)::int AS orders, COALESCE(SUM(o.total),0)::int AS revenue, COUNT(*) FILTER (WHERE o.status IN ('placed','accepted','preparing','ready'))::int AS live FROM sokoeats_vendors v LEFT JOIN sokoeats_orders o ON o.vendor_id = v.id GROUP BY v.id ORDER BY revenue DESC`);
    res.json({ vendors: rows });
  } catch (err) { next(err); }
}
