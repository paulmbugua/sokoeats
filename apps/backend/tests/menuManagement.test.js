import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';
import { updateMerchantMenuItem, deleteMerchantMenuItem } from '../controllers/vendorExperienceController.js';
import { merchantMenuItemUpdateSchema } from '../validators/interactionValidator.js';

test('product mutations require ownership and perform transactional updates', async () => {
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const queries = [];
  let ownsItem = true;
  let failUpdate = false;
  let released = 0;
  const query = async (sql, values = []) => {
    queries.push({ sql, values });
    if (sql.startsWith('SELECT * FROM sokoeats_vendors')) {
      assert.equal(values[0], 'authenticated-owner');
      return { rows: [{ id: 'owned-vendor', shop_type: 'restaurant' }] };
    }
    if (sql.startsWith('SELECT id FROM sokoeats_menu_items')) {
      assert.deepEqual(values, ['item-id', 'owned-vendor']);
      return { rows: ownsItem ? [{ id: 'item-id' }] : [] };
    }
    if (sql.includes('INSERT INTO sokoeats_menu_categories')) return { rows: [{ id: 'section-id' }] };
    if (sql.includes('UPDATE sokoeats_menu_items')) {
      assert.deepEqual(values.slice(-2), ['item-id', 'owned-vendor']);
      if (failUpdate) throw new Error('Database write failed');
      return { rows: [{ id: 'item-id', vendor_id: 'owned-vendor', section_id: 'section-id', name: values[2], price: values[4], image_url: values[5], available: values[7] }] };
    }
    if (sql.startsWith('DELETE FROM sokoeats_menu_items')) {
      assert.deepEqual(values, ['item-id', 'owned-vendor']);
      return { rows: ownsItem ? [{ id: 'item-id' }] : [] };
    }
    return { rows: [] };
  };
  pool.query = query;
  pool.connect = async () => ({ query, release() { released++; } });
  async function call(handler) {
    let status = 200, data, error;
    const body = merchantMenuItemUpdateSchema.validate({ name: 'Fresh Juice', price: 250, sectionTitle: 'Drinks', imageUrl: 'https://example.invalid/juice.jpg', available: false }).value;
    await handler({ auth: { sub: 'authenticated-owner' }, params: { id: 'item-id' }, body }, { status(code) { status = code; return this; }, json(value) { data = value; } }, err => { error = err; });
    return { status, data, error };
  }
  try {
    let result = await call(updateMerchantMenuItem);
    assert.equal(result.error, undefined);
    assert.equal(result.data.item.name, 'Fresh Juice');
    assert.equal(result.data.item.price, 250);
    assert.equal(result.data.item.available, false);
    assert.ok(queries.some(entry => entry.sql === 'COMMIT'));
    assert.equal(released, 1);
    ownsItem = false;
    queries.length = 0;
    assert.equal((await call(updateMerchantMenuItem)).status, 404);
    assert.ok(!queries.some(entry => entry.sql.includes('INSERT INTO')));
    assert.equal((await call(deleteMerchantMenuItem)).status, 404);
    ownsItem = true;
    assert.equal((await call(deleteMerchantMenuItem)).data.deletedId, 'item-id');
    failUpdate = true;
    queries.length = 0;
    result = await call(updateMerchantMenuItem);
    assert.equal(result.error.message, 'Database write failed');
    assert.ok(queries.some(entry => entry.sql === 'ROLLBACK'));
    assert.ok(!queries.some(entry => entry.sql === 'COMMIT'));
  } finally {
    pool.query = originalQuery;
    pool.connect = originalConnect;
    await pool.end();
  }
});

test('update validator rejects invalid prices and accepts automatic categories', () => {
  for (const price of [0, -2, 'not-a-price', 1.5]) {
    assert.ok(merchantMenuItemUpdateSchema.validate({ name: 'Meal', price }).error);
  }
  assert.equal(merchantMenuItemUpdateSchema.validate({ name: 'Meal', price: 100, sectionTitle: '' }).error, undefined);
});
