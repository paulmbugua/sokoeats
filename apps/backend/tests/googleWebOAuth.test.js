import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeGoogleWebCode, googleWebCredentials } from '../services/googleWebOAuth.js';

const env = { GOOGLE_CLIENT_ID_WEB: ' test-client.apps.googleusercontent.com ', GOOGLE_CLIENT_SECRET: ' test-secret ' };
const request = { code: 'test-authorization-code', redirectUri: 'http://localhost:4000/api/auth/google/callback' };
test('credentials are required and trimmed consistently', () => {
  assert.deepEqual(googleWebCredentials(env), { clientId: env.GOOGLE_CLIENT_ID_WEB.trim(), clientSecret: 'test-secret' });
  assert.throws(() => googleWebCredentials({}), { code: 'google_oauth_not_configured' });
});
test('exchange sends the configured pair only to Google and returns the ID token', async () => {
  let logged;
  const idToken = await exchangeGoogleWebCode(request, {
    env, logger: { info: (...args) => { logged = args; } },
    fetcher: async (url, init) => {
      assert.equal(url, 'https://oauth2.googleapis.com/token');
      assert.equal(init.body.get('client_id'), env.GOOGLE_CLIENT_ID_WEB.trim());
      assert.equal(init.body.get('client_secret'), 'test-secret');
      assert.equal(init.body.get('code'), request.code);
      assert.equal(init.body.get('redirect_uri'), request.redirectUri);
      return { ok: true, json: async () => ({ id_token: 'private-id-token', access_token: 'private-access-token' }) };
    },
  });
  assert.equal(idToken, 'private-id-token');
  assert.ok(!JSON.stringify(logged).includes('private'));
});
for (const code of ['invalid_client', 'invalid_grant', 'unexpected-provider-error']) {
  test(`handles ${code} without exposing secrets or provider descriptions`, async () => {
    let log;
    await assert.rejects(exchangeGoogleWebCode(request, {
      env, logger: { warn: (...args) => { log = args; } },
      fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: code, error_description: 'sensitive-provider-details' }) }),
    }), error => {
      assert.ok(!error.message.includes('sensitive-provider-details'));
      assert.equal(error.code, code === 'unexpected-provider-error' ? 'token_exchange_failed' : code);
      return true;
    });
    assert.ok(!JSON.stringify(log).includes('test-secret'));
    assert.ok(!JSON.stringify(log).includes('sensitive-provider-details'));
  });
}
