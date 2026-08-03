import pool from '../config/db.js';
export async function overview(_req, res, next) {
  try {
    const [orders, vendors, tickets] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(SUM(total),0)::int AS revenue FROM sokoeats_orders'),
      pool.query("SELECT COUNT(*)::int AS count FROM sokoeats_vendors WHERE status = 'active'"),
      pool.query("SELECT COUNT(*)::int AS count FROM sokoeats_tickets WHERE status IN ('open','pending')")
    ]);
    res.json({ metrics: [
      { label: 'Orders', value: String(orders.rows[0].count), delta: '+12%' },
      { label: 'Revenue', value: `KES ${Number(orders.rows[0].revenue).toLocaleString('en-KE')}`, delta: '+8%' },
      { label: 'Active vendors', value: String(vendors.rows[0].count) },
      { label: 'Open tickets', value: String(tickets.rows[0].count), delta: 'needs attention' }
    ] });
  } catch (err) { next(err); }
}
