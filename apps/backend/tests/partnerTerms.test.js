import assert from 'node:assert/strict';
import test from 'node:test';
import { getPartnerTerms, hasCurrentTerms, validateTermsAcceptance, recordTermsAcceptance } from '../services/partnerTerms.js';
import { registerSchema, updateProfileSchema } from '../validators/authValidator.js';

for (const role of ['rider', 'vendor', 'merchant']) {
  test(`${role}: exact, explicit consent is required`, () => {
    const document = getPartnerTerms(role);
    const consent = { role, accepted: true, version: document.version, hash: document.hash };
    assert.equal(validateTermsAcceptance(role, consent).hash, document.hash);
    for (const input of [undefined, {}, { ...consent, accepted: false }, { ...consent, accepted: 'true' }, { ...consent, version: 'old' }, { ...consent, hash: 'tampered' }, { ...consent, role: 'customer' }]) {
      assert.throws(() => validateTermsAcceptance(role, input), { status: 422 });
    }
    assert.equal(hasCurrentTerms({ role, terms_accepted_at: new Date() }), false);
    assert.equal(hasCurrentTerms({ role, partner_terms_version: document.version, partner_terms_role: role }), true);
    assert.equal(registerSchema.validate({ role, fullName: 'Test Partner', email: 'test@example.com', password: 'test-password', termsAcceptance: consent }).error, undefined);
    assert.ok(updateProfileSchema.validate({ termsAcceptance: { ...consent, accepted: 'true' } }).error);
  });
}
test('roles have distinct terms and aliases cannot bypass consent', () => {
  assert.notEqual(getPartnerTerms('vendor').hash, getPartnerTerms('merchant').hash);
  assert.throws(() => validateTermsAcceptance('courier', undefined), { status: 422 });
  assert.throws(() => validateTermsAcceptance('merchant_admin', undefined), { status: 422 });
  assert.equal(validateTermsAcceptance('customer', undefined), null);
});
test('acceptance records the full server document and updates the user', async () => {
  const document = getPartnerTerms('rider');
  const queries = [];
  const db = { async query(sql, args) { queries.push({ sql, args }); return { rows: [{ id: 'user-id' }] }; } };
  await recordTermsAcceptance(db, { id: 'user-id', role: 'rider' }, { accepted: true, role: 'rider', version: document.version, hash: document.hash });
  assert.deepEqual(JSON.parse(queries[0].args[4]), document);
  assert.equal(queries[0].args[0], 'user-id');
  assert.match(queries[0].sql, /ON CONFLICT/);
  assert.match(queries[1].sql, /partner_terms_version/);
});
