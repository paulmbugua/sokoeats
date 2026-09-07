import test from 'node:test';
import assert from 'node:assert/strict';
import { itemPricing, platformVat } from '../services/commercePricing.js';
import { calculateDeliveryFee, calculateSmallOrderFee, developmentRouteEstimate } from '../services/pricingService.js';

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

test('keeps the rider delivery minimum for short mapped routes', () => {
  const result = calculateDeliveryFee({ distanceKm: 1.4, durationMin: 10 }, { delivery_fee: 150 });
  assert.equal(result.deliveryFee, 150);
  assert.equal(result.distanceFee, 0);
  assert.equal(result.timeFee, 0);
});

test('prices longer delivery routes from routed distance and traffic time', () => {
  const result = calculateDeliveryFee({ distanceKm: 5.2, durationMin: 25 }, { delivery_fee: 150 });
  assert.equal(result.distanceFee, 112);
  assert.equal(result.timeFee, 30);
  assert.equal(result.deliveryFee, 245);
});

test('applies a removable small-order fee below the KES 300 basket minimum', () => {
  assert.deepEqual(calculateSmallOrderFee(55), { minimumOrder: 300, amountToMinimum: 245, smallOrderFee: 50 });
  assert.deepEqual(calculateSmallOrderFee(300), { minimumOrder: 300, amountToMinimum: 0, smallOrderFee: 0 });
});


test('development route estimate handles co-located office pins', () => {
  const point = { lat: 25.4162307, lng: 51.4962416 };
  const result = developmentRouteEstimate(point, point);
  assert.equal(result.distanceKm, 0.05);
  assert.equal(result.durationMin, 1);
  assert.equal(result.source, 'development_estimate');
});
