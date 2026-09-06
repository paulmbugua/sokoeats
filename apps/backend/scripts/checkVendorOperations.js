import '../config/env.js';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const { rows } = await pool.query(`SELECT u.id,u.role,v.name
  FROM sokoeats_users u JOIN sokoeats_vendors v ON v.owner_user_id=u.id
  WHERE v.status='active' AND v.verification_status='verified' LIMIT 1`);
const partner = rows[0];
if (!partner) throw new Error('No verified partner is available for the operations check');
const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
const token = jwt.sign({ sub: partner.id, role: partner.role }, secret, { expiresIn: '2m' });
const response = await fetch('http://127.0.0.1:4000/api/vendor/operations', { headers: { Authorization: `Bearer ${token}` } });
const body = await response.json();
if (!response.ok) throw new Error(body.message || `Operations endpoint returned ${response.status}`);
for (const field of ['vendor','metrics','trend','orders','ratings','catalogue']) {
  if (!(field in body.operations)) throw new Error(`Operations payload is missing ${field}`);
}
console.log(JSON.stringify({ ok: true, vendor: body.operations.vendor.name, orders: body.operations.orders.length, catalogue: body.operations.catalogue, ratings: body.operations.ratings.count }));
await pool.end();
