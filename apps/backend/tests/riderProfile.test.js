import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/db.js';
import { riderProfileRatings } from '../controllers/riderController.js';

test('rider profile uses authenticated user details and real delivery totals', async () => {
  const originalQuery = pool.query;
  pool.query = async (sql, values) => {
    assert.match(sql, /WHERE u\.id=\$1/);
    assert.deepEqual(values, ['rider-user-id']);
    return { rows: [{
      id: 'rider-user-id',
      name: 'Amina Noor',
      email: 'amina@example.com',
      phone: '+254700000000',
      city: 'Nairobi',
      status: 'active',
      avatar_url: 'https://images.example.com/amina.jpg',
      created_at: '2026-01-15T09:00:00.000Z',
      profile: { vehicleType: 'Motorbike', registrationNumber: 'KMD 482L' },
      assigned_deliveries: 5,
      completed_deliveries: 4,
    }] };
  };
  let body;
  let error;
  try {
    await riderProfileRatings(
      { auth: { sub: 'rider-user-id' } },
      { status() { return this; }, json(value) { body = value; } },
      (reason) => { error = reason; },
    );
    assert.equal(error, undefined);
    assert.equal(body.profile.rider.name, 'Amina Noor');
    assert.equal(body.profile.rider.avatarUrl, 'https://images.example.com/amina.jpg');
    assert.equal(body.profile.rider.vehicle, 'Motorbike (KMD 482L)');
    assert.equal(body.profile.rider.rating, 'New');
    assert.deepEqual(body.profile.stats, [
      { label: 'Completion rate', value: '80%' },
      { label: 'Deliveries', value: '4' },
    ]);
    assert.deepEqual(body.profile.feedback, []);
  } finally {
    pool.query = originalQuery;
  }
});
