import pool from '../config/db.js';
const code = () => `SE-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const orderJson = (row) => ({ id: row.id, code: row.code, customerName: row.customer_name, vendorName: row.vendor_name, status: row.status, subtotal: Number(row.subtotal), deliveryFee: Number(row.delivery_fee), serviceFee: Number(row.service_fee), total: Number(row.total), deliveryAddress: row.delivery_address, createdAt: row.created_at });
export async function listOrders(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT o.*, COALESCE(u.name, 'Guest') AS customer_name, v.name AS vendor_name FROM sokoeats_orders o LEFT JOIN sokoeats_users u ON u.id = o.customer_user_id JOIN sokoeats_vendors v ON v.id = o.vendor_id ORDER BY o.created_at DESC LIMIT 80`);
    res.json({ orders: rows.map(orderJson) });
  } catch (err) { next(err); }
}
export async function createOrder(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { customerName, customerEmail, phone, vendorId, deliveryAddress, notes, items } = req.body;
    const userResult = await client.query(`INSERT INTO sokoeats_users (name, email, phone, role) VALUES ($1, COALESCE($2, $3 || '@guest.sokoeats.local'), $3, 'customer') ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone RETURNING id`, [customerName, customerEmail || null, phone || null]);
    const menuResult = await client.query('SELECT id, name, price FROM sokoeats_menu_items WHERE vendor_id = $1 AND id = ANY($2::uuid[]) AND available = true', [vendorId, items.map((i) => i.menuItemId)]);
    const menu = new Map(menuResult.rows.map((item) => [String(item.id), item]));
    let subtotal = 0;
    for (const line of items) {
      const item = menu.get(String(line.menuItemId));
      if (!item) throw Object.assign(new Error('Menu item unavailable'), { status: 409 });
      subtotal += Number(item.price) * Number(line.quantity);
    }
    const vendor = await client.query('SELECT delivery_fee FROM sokoeats_vendors WHERE id = $1', [vendorId]);
    if (!vendor.rows.length) throw Object.assign(new Error('Vendor not found'), { status: 404 });
    const deliveryFee = Number(vendor.rows[0].delivery_fee);
    const serviceFee = Math.round(subtotal * 0.04);
    const total = subtotal + deliveryFee + serviceFee;
    const order = await client.query(`INSERT INTO sokoeats_orders (code, customer_user_id, vendor_id, subtotal, delivery_fee, service_fee, total, delivery_address, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [code(), userResult.rows[0].id, vendorId, subtotal, deliveryFee, serviceFee, total, deliveryAddress, notes || null]);
    for (const line of items) {
      const item = menu.get(String(line.menuItemId));
      await client.query(`INSERT INTO sokoeats_order_items (order_id, menu_item_id, name, quantity, unit_price, line_total, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [order.rows[0].id, item.id, item.name, line.quantity, item.price, Number(item.price) * Number(line.quantity), line.notes || null]);
    }
    await client.query('COMMIT');
    const full = await pool.query(`SELECT o.*, COALESCE(u.name, 'Guest') AS customer_name, v.name AS vendor_name FROM sokoeats_orders o LEFT JOIN sokoeats_users u ON u.id = o.customer_user_id JOIN sokoeats_vendors v ON v.id = o.vendor_id WHERE o.id = $1`, [order.rows[0].id]);
    res.status(201).json({ order: orderJson(full.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally { client.release(); }
}
export async function updateOrderStatus(req, res, next) {
  try {
    const { rows } = await pool.query('UPDATE sokoeats_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *', [req.body.status, req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });
    res.json({ order: rows[0] });
  } catch (err) { next(err); }
}
