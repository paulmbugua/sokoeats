import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pool from '../config/db.js';
import { updateVendorCompliance } from '../controllers/financeController.js';

const client = await pool.connect();
const originalConnect = pool.connect;
const originalFetch = globalThis.fetch;
const originalKey = process.env.FINANCE_DATA_KEY;
try {
  await client.query('BEGIN');
  const migration = await fs.readFile(new URL('../db/vendorTimestamps.sql', import.meta.url), 'utf8');
  await client.query(migration);
  await client.query(migration);
  const tag = crypto.randomUUID();
  const user = (await client.query(`INSERT INTO sokoeats_users(name,email,role)
    VALUES('Compliance regression',$1,'vendor') RETURNING id`, [`compliance-${tag}@example.invalid`])).rows[0];
  const vendor = (await client.query(`INSERT INTO sokoeats_vendors(name,slug,cuisine,owner_user_id,updated_at)
    VALUES('Compliance regression',$1,'test',$2,'2000-01-01') RETURNING id`, [`compliance-${tag}`, user.id])).rows[0];

  // Keep the controller's transaction inside the rollback-only fixture transaction.
  pool.connect = async () => ({
    query: (sql, values) => client.query(sql === 'BEGIN' ? 'SAVEPOINT compliance_submission' : sql === 'COMMIT' ? 'RELEASE SAVEPOINT compliance_submission' : sql === 'ROLLBACK' ? 'ROLLBACK TO SAVEPOINT compliance_submission' : sql, values),
    release() {},
  });
  globalThis.fetch = async () => { throw new Error('External calls are forbidden in this regression check'); };
  process.env.FINANCE_DATA_KEY = crypto.randomBytes(32).toString('hex');
  const request = {
    auth: { sub: user.id, role: 'vendor' },
    body: {
      legalBusinessName: 'Compliance regression', registrationNumber: 'TEST-REG', kraPin: 'TEST-KRA-1234',
      directorName: 'Test Director', directorNationalId: 'TEST-ID-1234',
      settlementMethod: 'mpesa_wallet', settlementAccount: 'TEST-ACCOUNT-1234',
      pspRecipientCode: 'RCP_regression_no_provider_call', commissionAgreementVersion: 'test-v1',
    },
  };
  for (const name of ['Initial submission', 'Resubmission']) {
    request.body.legalBusinessName = name;
    let result, failure;
    await updateVendorCompliance(request, { json: value => { result = value; } }, error => { failure = error; });
    if (failure) throw failure;
    assert.equal(result.compliance.legalBusinessName, name);
    assert.equal(result.compliance.verificationStatus, 'submitted');
  }
  const saved = (await client.query('SELECT updated_at,verification_status,payout_status FROM sokoeats_vendors WHERE id=$1', [vendor.id])).rows[0];
  assert.ok(new Date(saved.updated_at).getTime() > Date.parse('2000-01-01'));
  assert.equal(saved.verification_status, 'submitted');
  assert.equal(saved.payout_status, 'pending_verification');
  assert.equal((await client.query('SELECT COUNT(*)::int AS count FROM sokoeats_payout_profiles WHERE vendor_id=$1', [vendor.id])).rows[0].count, 1);
  console.log('PASS: repeatable migration, compliance submission/resubmission, vendor timestamp and payout profile. Fixtures rolled back; no Paystack calls.');
} finally {
  pool.connect = originalConnect;
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FINANCE_DATA_KEY;
  else process.env.FINANCE_DATA_KEY = originalKey;
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
}
