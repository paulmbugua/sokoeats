import test from 'node:test';
import assert from 'node:assert/strict';
import { canViewDelivery, deliveryEstimate, distanceMeters, deliverySteps } from '../services/deliveryTracking.js';
import { deliveryActionSchema, deliveryLocationSchema } from '../validators/deliveryValidator.js';

const order = { customer_user_id: 'buyer', owner_user_id: 'owner', rider_user_id: 'rider', status: 'picked_up', estimated_duration_min: 20 };
test('order coordinates are restricted to involved parties and support', () => {
  for (const [sub, role] of [['buyer','customer'],['owner','vendor'],['owner','merchant'],['rider','rider'],['rider','courier'],['staff','support']]) assert.equal(canViewDelivery(order, { sub, role }), true);
  for (const role of ['customer','vendor','merchant','rider','courier','unknown']) assert.equal(canViewDelivery(order, { sub: 'stranger', role }), false);
  assert.equal(canViewDelivery(order, { sub: 'owner', role: 'customer' }), false);
});
test('ETA is unavailable until a real pickup timestamp exists', () => {
  assert.equal(deliveryEstimate(order, []), null);
});
test('ETA advances by real elapsed minutes and reports overruns', () => {
  const at = Date.parse('2026-09-02T10:00:00Z');
  const events = [{ event_type: 'picked_up', occurred_at: new Date(at) }];
  assert.equal(deliveryEstimate(order, events, at + 7 * 60000).minutes, 13);
  assert.equal(deliveryEstimate(order, events, at + 21 * 60000).overdue, true);
  assert.equal(deliveryEstimate({ ...order, status: 'delivered' }, events), null);
  assert.equal(deliveryEstimate({ ...order, rider_arrived_at: new Date() }, events), null);
});
test('arrival distance is measured from the exact confirmed pin', () => {
  const pin = { latitude: -1.28, longitude: 36.82 };
  assert.equal(distanceMeters(pin, pin), 0);
  assert.ok(distanceMeters(pin, { latitude: -1.281, longitude: 36.82 }) < 200);
  assert.ok(distanceMeters(pin, { latitude: -1.29, longitude: 36.82 }) > 1000);
});
test('handover requires a six-digit OTP and known action', () => {
  assert.ok(deliveryActionSchema.validate({ action: 'deliver' }).error);
  assert.ok(deliveryActionSchema.validate({ action: 'deliver', otp: '123' }).error);
  assert.ok(deliveryActionSchema.validate({ action: 'settle' }).error);
  assert.equal(deliveryActionSchema.validate({ action: 'deliver', otp: '123456' }).error, undefined);
});
test('location uploads reject invalid coordinates and inaccurate fixes', () => {
  const fix = { latitude: 0, longitude: 36.8, accuracy: 30, capturedAt: new Date().toISOString() };
  assert.equal(deliveryLocationSchema.validate(fix).error, undefined);
  for (const changes of [{ latitude: 91 }, { longitude: -181 }, { accuracy: 500 }, { capturedAt: 'yesterday' }]) assert.ok(deliveryLocationSchema.validate({ ...fix, ...changes }).error);
});
test('buyer milestones include acceptance, preparation, dispatch, arrival and handover', () => {
  assert.deepEqual(deliverySteps.map(([key]) => key), ['placed','accepted','preparing','ready','rider_assigned','picked_up','arrived','delivered']);
});
