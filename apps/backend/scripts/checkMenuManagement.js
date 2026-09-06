import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../config/db.js';
import { updateMerchantMenuItem, deleteMerchantMenuItem } from '../controllers/vendorExperienceController.js';
import { merchantMenuItemUpdateSchema } from '../validators/interactionValidator.js';

const client = await pool.connect();
const originalQuery = pool.query;
const originalConnect = pool.connect;
async function call(handler, user, id, body = {}) {
  let data, failure, status = 200;
  const res = { status(code) { status = code; return this; }, json(value) { data = value; } };
  await handler({ auth: { sub: user }, params: { id }, body }, res, error => { failure = error; });
  if (failure) throw failure;
  return { status, data };
}
try {
  await client.query('BEGIN');
  const tag = crypto.randomUUID();
  const users = [];
  const vendors = [];
  for (const role of ['vendor', 'merchant']) {
    users.push((await client.query('INSERT INTO sokoeats_users(name,email,role) VALUES($1,$2,$3) RETURNING id', ['Catalogue check', `${role}-${tag}@example.invalid`, role])).rows[0].id);
    vendors.push((await client.query('INSERT INTO sokoeats_vendors(name,slug,cuisine,owner_user_id) VALUES($1,$2,$3,$4) RETURNING id', ['Catalogue check', `${role}-${tag}`, 'test', users.at(-1)])).rows[0].id);
  }
  const product = (await client.query(`INSERT INTO sokoeats_menu_items(vendor_id,name,description,price,category,image_url)
    VALUES($1,'Original product','Original description',195,'Drinks','https://images.example.invalid/original.jpg') RETURNING id`, [vendors[0]])).rows[0];
  const order = (await client.query(`INSERT INTO sokoeats_orders(code,vendor_id,subtotal,delivery_fee,total,delivery_address)
    VALUES($1,$2,195,0,195,'Test address') RETURNING id`, [tag, vendors[0]])).rows[0];
  await client.query(`INSERT INTO sokoeats_order_items(order_id,menu_item_id,name,quantity,unit_price,line_total)
    VALUES($1,$2,'Original product',1,195,195)`, [order.id, product.id]);
  // Keep all controller writes inside the rollback-only fixture transaction.
  pool.query = client.query.bind(client);
  pool.connect = async () => ({ query: (sql, values) => client.query(sql === 'BEGIN' ? 'SAVEPOINT menu_check' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT menu_check' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT menu_check' : sql, values), release() {} });
  const { error, value: body } = merchantMenuItemUpdateSchema.validate({ name: 'Updated product', description: 'Updated description', price: 250, sectionTitle: 'Meals', imageUrl: 'https://images.example.invalid/replacement.jpg', unitLabel: 'plate', available: false, popular: true, sortOrder: 3 });
  assert.equal(error, undefined);
  assert.equal((await call(updateMerchantMenuItem, users[1], product.id, body)).status, 404);
  assert.equal((await call(deleteMerchantMenuItem, users[1], product.id)).status, 404);
  const updated = await call(updateMerchantMenuItem, users[0], product.id, body);
  assert.equal(updated.data.item.name, body.name);
  assert.equal(updated.data.item.price, 250);
  assert.equal(updated.data.item.category, 'Meals');
  assert.equal(updated.data.item.imageUrl, body.imageUrl);
  assert.equal(updated.data.item.available, false);
  assert.equal(updated.data.item.popular, true);
  assert.equal(updated.data.item.unitLabel, 'plate');
  assert.equal((await call(deleteMerchantMenuItem, users[0], product.id)).status, 200);
  assert.equal((await client.query('SELECT id FROM sokoeats_menu_items WHERE id=$1', [product.id])).rowCount, 0);
  const savedOrder = (await client.query('SELECT * FROM sokoeats_order_items WHERE order_id=$1', [order.id])).rows[0];
  assert.equal(savedOrder.menu_item_id, null);
  assert.equal(savedOrder.name, 'Original product');
  assert.equal(savedOrder.unit_price, 195);
  assert.equal((await call(deleteMerchantMenuItem, users[0], product.id)).status, 404);
  assert.equal((await call(updateMerchantMenuItem, users[0], product.id, body)).status, 404);
  assert.equal((await call(deleteMerchantMenuItem, users[0], 'invalid-id')).status, 404);
  console.log('PASS: edit fields, category move, ownership isolation, deletion, missing items, and preserved order snapshots. All fixtures rolled back.');
} finally {
  pool.query = originalQuery;
  pool.connect = originalConnect;
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
