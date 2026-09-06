import test from 'node:test';
import assert from 'node:assert/strict';
import { merchantMenuItemSchema } from '../validators/interactionValidator.js';
import { validate } from '../validators/validate.js';

const product = { name: 'Passion Juice', description: 'Fresh juice', price: 195, unitLabel: 'glass', imageUrl: 'https://images.sokoeats.co.ke/test.jpg', available: true };

for (const sectionTitle of [undefined, '', '   ']) {
  test(`automatic categorization accepts sectionTitle ${JSON.stringify(sectionTitle)}`, () => {
    const req = { body: { ...product, sectionTitle } };
    let continued = false;
    validate(merchantMenuItemSchema)(req, { status() { assert.fail('Valid product was rejected'); } }, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.body.sectionTitle, undefined);
    assert.equal(req.body.price, 195);
  });
}

test('explicit category and product name are trimmed', () => {
  const result = merchantMenuItemSchema.validate({ ...product, name: ' Passion Juice ', sectionTitle: ' Drinks ' });
  assert.equal(result.error, undefined);
  assert.equal(result.value.sectionTitle, 'Drinks');
  assert.equal(result.value.name, 'Passion Juice');
});

test('invalid product fields still return field-specific validation errors', () => {
  for (const [field, value] of [['name', ' '], ['sectionTitle', 'X'], ['price', 0], ['imageUrl', 'not-a-url'], ['description', 'x'.repeat(501)]]) {
    const req = { body: { ...product, [field]: value } };
    let status;
    let body;
    const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
    validate(merchantMenuItemSchema)(req, res, () => assert.fail('Invalid product accepted'));
    assert.equal(status, 422);
    assert.ok(body.details.some(detail => detail.includes(field)));
  }
});
