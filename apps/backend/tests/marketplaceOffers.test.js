import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMarketplaceOffers } from '../controllers/catalogController.js';

test('publishes only offers supported by checkout pricing', () => {
  const previous = {
    service: process.env.SOKOEATS_SERVICE_FEE_BPS,
    minimum: process.env.SOKOEATS_MINIMUM_ORDER,
    smallOrder: process.env.SOKOEATS_SMALL_ORDER_FEE,
  };
  process.env.SOKOEATS_SERVICE_FEE_BPS = '400';
  process.env.SOKOEATS_MINIMUM_ORDER = '300';
  process.env.SOKOEATS_SMALL_ORDER_FEE = '50';

  const offers = buildMarketplaceOffers();

  assert.deepEqual(offers.map(({ id }) => id), ['first-order-service-fee', 'smart-basket']);
  assert.match(offers[0].title, /4% service fee/);
  assert.match(offers[1].title, /KSh 300/);
  assert.doesNotMatch(JSON.stringify(offers), /cashback|free delivery/i);

  if (previous.service === undefined) delete process.env.SOKOEATS_SERVICE_FEE_BPS;
  else process.env.SOKOEATS_SERVICE_FEE_BPS = previous.service;
  if (previous.minimum === undefined) delete process.env.SOKOEATS_MINIMUM_ORDER;
  else process.env.SOKOEATS_MINIMUM_ORDER = previous.minimum;
  if (previous.smallOrder === undefined) delete process.env.SOKOEATS_SMALL_ORDER_FEE;
  else process.env.SOKOEATS_SMALL_ORDER_FEE = previous.smallOrder;
});
