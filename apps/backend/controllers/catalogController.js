import pool from '../config/db.js';
export async function listVendors(_req, res, next) {
  try {
    const { rows } = await pool.query("SELECT id, name, slug, cuisine, status, rating::float AS rating, prep_minutes AS \"prepMinutes\", delivery_fee AS \"deliveryFee\", minimum_order AS \"minimumOrder\", image_url AS \"imageUrl\" FROM sokoeats_vendors ORDER BY status = 'active' DESC, rating DESC");
    res.json({ vendors: rows });
  } catch (err) { next(err); }
}
export async function listMenu(req, res, next) {
  try {
    const params = [];
    let where = 'WHERE available = true';
    if (req.query.vendorId) { params.push(req.query.vendorId); where += ` AND vendor_id = $${params.length}`; }
    const { rows } = await pool.query(`SELECT id, vendor_id AS "vendorId", name, description, price, category, popular, available, image_url AS "imageUrl" FROM sokoeats_menu_items ${where} ORDER BY popular DESC, category, name`, params);
    res.json({ items: rows });
  } catch (err) { next(err); }
}
