import test from 'node:test';
import assert from 'node:assert/strict';
import { itemPricing, platformVat } from '../services/commercePricing.js';

test('adds the 10 percent marketplace amount to the customer-facing price', () => {
  const result = itemPricing(
    { price: 1500, tax_category: 'standard', tax_rate_bps: 1600 },
    { commission_rate_bps: 1000, vat_registered: false },
  );

  assert.equal(result.partnerPrice, 1500);
  assert.equal(result.commissionAmount, 150);
  assert.equal(result.customerPrice, 1650);
  assert.equal(result.vatAmount, 0);
});

test('calculates item VAT only for a VAT-registered partner and standard-rated item', () => {
  const standard = itemPricing(
    { price: 1500, tax_category: 'standard', tax_rate_bps: 1600 },
    { commission_rate_bps: 1000, vat_registered: true },
  );
  const exempt = itemPricing(
    { price: 1500, tax_category: 'exempt', tax_rate_bps: 1600 },
    { commission_rate_bps: 1000, vat_registered: true },
  );

  assert.equal(standard.vatAmount, 264);
  assert.equal(exempt.vatAmount, 0);
});

test('does not tax platform fees unless platform VAT is explicitly enabled', () => {
  const previous = process.env.SOKOEATS_VAT_REGISTERED;
  process.env.SOKOEATS_VAT_REGISTERED = 'false';
  assert.equal(platformVat(500), 0);
  if (previous === undefined) delete process.env.SOKOEATS_VAT_REGISTERED;
  else process.env.SOKOEATS_VAT_REGISTERED = previous;
});
