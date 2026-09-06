import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../config/db.js';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const tag = crypto.randomUUID();
  const user = (await client.query(`INSERT INTO sokoeats_users(name,email,role) VALUES('Tracking regression',$1,'customer') RETURNING id`, [`tracking-${tag}@example.invalid`])).rows[0];
  const vendor = (await client.query(`INSERT INTO sokoeats_vendors(name,slug,cuisine) VALUES('Tracking regression',$1,'test') RETURNING id`, [`tracking-${tag}`])).rows[0];
  const order = (await client.query(`INSERT INTO sokoeats_orders(code,customer_user_id,vendor_id,subtotal,delivery_fee,total,delivery_address,dropoff_latitude,dropoff_longitude)
    VALUES($1,$2,$3,100,50,150,'Test delivery entrance',0,36.82) RETURNING id`, [tag, user.id, vendor.id])).rows[0];
  for (const status of ['accepted','preparing','ready','picked_up']) await client.query('UPDATE sokoeats_orders SET status=$2 WHERE id=$1', [order.id, status]);
  await client.query('UPDATE sokoeats_orders SET rider_arrived_at=NOW() WHERE id=$1', [order.id]);
  await client.query("UPDATE sokoeats_orders SET status='delivered' WHERE id=$1", [order.id]);
  await client.query("UPDATE sokoeats_orders SET status='delivered' WHERE id=$1", [order.id]);
  const { rows } = await client.query('SELECT event_type FROM sokoeats_order_tracking_events WHERE order_id=$1 ORDER BY id', [order.id]);
  assert.deepEqual(rows.map(row => row.event_type), ['placed','accepted','preparing','ready','picked_up','arrived','delivered']);
  const saved = (await client.query('SELECT dropoff_latitude,dropoff_longitude FROM sokoeats_orders WHERE id=$1', [order.id])).rows[0];
  assert.equal(Number(saved.dropoff_latitude), 0);
  assert.equal(Number(saved.dropoff_longitude), 36.82);
  console.log('PASS: persisted delivery pin, ordered lifecycle events, duplicate prevention. Test data rolled back.');
} finally {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
