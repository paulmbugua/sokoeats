import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pool from '../config/db.js';
import { getPartnerTerms, hasCurrentTerms, recordTermsAcceptance } from '../services/partnerTerms.js';
import { register, updateProfile } from '../controllers/authController.js';
import { requireRole } from '../middleware/auth.js';
import jwt from 'jsonwebtoken';

// Route controller calls share a single rollback-only connection, so this check leaves no test accounts.
const client = await pool.connect();
const originalConnect = pool.connect.bind(pool);
const originalQuery = pool.query.bind(pool);
const query = client.query.bind(client);
let savepoint = 0;
const connection = {
  release() {},
  async query(sql, args) {
    if (sql === 'BEGIN') return query(`SAVEPOINT terms_test_${++savepoint}`);
    if (sql === 'COMMIT') return query(`RELEASE SAVEPOINT terms_test_${savepoint}`);
    if (sql === 'ROLLBACK') return query(`ROLLBACK TO SAVEPOINT terms_test_${savepoint}`);
    return query(sql, args);
  },
};
const invoke = async (handler, req) => {
  let output, error;
  const res = { status() { return this; }, json(value) { output = value; return this; } };
  await handler(req, res, (err) => { error = err; });
  return { output, error };
};
try {
  await query('BEGIN');
  pool.connect = async () => connection;
  pool.query = (sql, args) => query(sql, args);
  for (const role of ['rider', 'vendor', 'merchant']) {
    const document = getPartnerTerms(role);
    const consent = { accepted: true, role, version: document.version, hash: document.hash };
    const req = { body: { role, fullName: 'Terms test', email: `terms-${crypto.randomUUID()}@example.invalid`, password: crypto.randomUUID(), phone: '0712345678', city: 'Nairobi', businessName: 'Terms test shop', storeAddress: 'Test address', businessCategory: 'Restaurant', vehicleType: 'Motorbike', registrationNumber: 'TEST' }, get() { return 'terms-integration-test'; }, ip: '127.0.0.1' };
    // Start a parent savepoint because register rolls back even on pre-validation failures.
    await connection.query('BEGIN');
    const denied = await invoke(register, req);
    assert.equal(denied.error?.status, 422);
    assert.equal((await query('SELECT count(*) FROM sokoeats_users WHERE email=$1', [req.body.email])).rows[0].count, '0');
    req.body.termsAcceptance = consent;
    const created = await invoke(register, req);
    assert.ifError(created.error);
    assert.equal(created.output.user.termsAccepted, true);
    assert.equal(created.output.user.profileComplete, true);
    const userId = created.output.user.id;
    if (role !== 'rider') assert.equal((await query('SELECT count(*) FROM sokoeats_vendors WHERE owner_user_id=$1', [userId])).rows[0].count, '1');
    await recordTermsAcceptance(connection, { id: userId, role }, consent);
    const records = await query('SELECT * FROM sokoeats_terms_acceptances WHERE user_id=$1', [userId]);
    assert.equal(records.rowCount, 1);
    assert.deepEqual(records.rows[0].document, document);
    const before = (await query('SELECT profile FROM sokoeats_users WHERE id=$1', [userId])).rows[0].profile;
    const updated = await invoke(updateProfile, { body: { termsAcceptance: consent }, get: () => `Bearer ${created.output.token}` });
    assert.ifError(updated.error);
    assert.deepEqual(updated.output.user.profile, before);
  }
  const id = crypto.randomUUID();
  await query("INSERT INTO sokoeats_users (id,name,email,role,status,auth_provider) VALUES ($1,'Google Rider',$2,'rider','active','google')", [id, `${id}@example.invalid`]);
  const user = (await query('SELECT * FROM sokoeats_users WHERE id=$1', [id])).rows[0];
  assert.equal(hasCurrentTerms(user), false);
  const blocked = await invoke(requireRole('rider'), { auth: { sub: id, role: 'rider' }, method: 'POST', originalUrl: '/api/rider/requests/test/accept' });
  assert.equal(blocked.error?.status, 403);
  const token = jwt.sign({ sub: id, role: 'rider' }, process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET);
  const document = getPartnerTerms('rider');
  const result = await invoke(updateProfile, { body: { phone: '0712345678', city: 'Nairobi', vehicleType: 'Motorbike', registrationNumber: 'TEST', termsAcceptance: { accepted: true, role: 'rider', version: document.version, hash: document.hash } }, get: () => `Bearer ${token}` });
  assert.ifError(result.error);
  assert.equal(result.output.user.profileComplete, true);
  console.log('PASS: registration, vendor provisioning, missing consent, idempotent receipts, terms-only profile preservation, Google rider completion, and action gate. All test rows rolled back.');
} finally {
  pool.connect = originalConnect; pool.query = originalQuery;
  await query('ROLLBACK'); client.release(); await pool.end();
}
