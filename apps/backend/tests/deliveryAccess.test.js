import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';
import { trackDelivery, shareDeliveryLocation, deliveryAction } from '../controllers/deliveryController.js';

const order = { id: 'order', customer_user_id: 'buyer', owner_user_id: 'owner', rider_user_id: 'assigned-rider', status: 'picked_up' };
test('tracking endpoint does not query or reveal coordinates for another buyer', async () => {
  const original = pool.query;
  let calls = 0, error;
  pool.query = async () => { calls++; return { rows: [order] }; };
  try {
    await trackDelivery({ params: { orderKey: 'order' }, auth: { sub: 'other', role: 'customer' } }, {}, e => { error = e; });
    assert.equal(error.status, 403);
    assert.equal(calls, 1);
  } finally { pool.query = original; }
});
test('rider location API rejects stale GPS and rolls back without inserting', async () => {
  const original = pool.connect;
  const queries = [];
  pool.connect = async () => ({ query: async sql => { queries.push(sql); return { rows: sql.includes('SELECT o.*') ? [order] : [] }; }, release() {} });
  let error;
  try {
    await shareDeliveryLocation({ params: { orderKey: 'order' }, auth: { sub: 'assigned-rider', role: 'rider' }, body: { latitude: -1, longitude: 36, accuracy: 10, capturedAt: new Date(Date.now() - 120000).toISOString() } }, {}, e => { error = e; });
    assert.equal(error.status, 422);
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.some(sql => sql.includes('INSERT')));
  } finally { pool.connect = original; }
});
test('assigned rider cannot pick up an order before the shop marks it ready', async () => {
  const original = pool.connect;
  const queries = [];
  pool.connect = async () => ({ query: async sql => { queries.push(sql); return { rows: sql.includes('SELECT o.*') ? [{ ...order, status: 'preparing' }] : [] }; }, release() {} });
  let error;
  try {
    await deliveryAction({ params: { orderKey: 'order' }, auth: { sub: 'assigned-rider', role: 'rider' }, body: { action: 'pickup' } }, {}, e => { error = e; });
    assert.equal(error.status, 409);
    assert.ok(!queries.some(sql => /^UPDATE\s/i.test(sql.trim())));
  } finally { pool.connect = original; }
});
test.after(async () => { await pool.end(); });
