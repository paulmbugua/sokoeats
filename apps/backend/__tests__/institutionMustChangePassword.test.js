import test from 'node:test';
import assert from 'node:assert';
import bcrypt from 'bcryptjs';

import pool from '../config/db.js';
import { institutionLogin, institutionChangePassword } from '../controllers/institutionAuthController.js';

const originalQuery = pool.query;

const makeRes = () => {
  const res = {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.payload = obj;
      return this;
    },
  };
  return res;
};

test('institution login surfaces must_change_password and clears after change', async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  process.env.SKIP_ORG_BOOTSTRAP = '1';

  const state = {
    hash: await bcrypt.hash('temp-pass', 10),
    mustChange: true,
  };

  pool.query = async (sql, params = []) => {
    const text = typeof sql === 'string' ? sql : sql?.text || '';
    const lower = text.toLowerCase();

    if (lower.startsWith('select * from users where email')) {
      return {
        rows: [
          {
            id: 1,
            email: params[0],
            password: state.hash,
            must_change_password: state.mustChange,
          },
        ],
        rowCount: 1,
      };
    }

    if (lower.startsWith('select id, password from users where id')) {
      return { rows: [{ id: params[0], password: state.hash }], rowCount: 1 };
    }

    if (lower.includes('update users') && lower.includes('must_change_password = false')) {
      state.hash = params[0];
      state.mustChange = false;
      return { rows: [], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  };

  // First login with temporary password
  const loginReq = { body: { email: 'temp@example.com', password: 'temp-pass' } };
  const loginRes = makeRes();
  await institutionLogin(loginReq, loginRes);

  assert.strictEqual(loginRes.statusCode, 200);
  assert.equal(loginRes.payload?.mustChangePassword, true);
  assert.equal(loginRes.payload?.must_change_password, true);

  // Change password should clear flag
  const changeReq = {
    user: { id: 1 },
    body: { currentPassword: 'temp-pass', newPassword: 'new-strong-pass' },
  };
  const changeRes = makeRes();
  await institutionChangePassword(changeReq, changeRes);

  assert.strictEqual(changeRes.statusCode, 200);
  assert.equal(state.mustChange, false);

  // Login again with new password should not require change
  const reloginReq = { body: { email: 'temp@example.com', password: 'new-strong-pass' } };
  const reloginRes = makeRes();
  await institutionLogin(reloginReq, reloginRes);

  assert.strictEqual(reloginRes.statusCode, 200);
  assert.notEqual(reloginRes.payload?.mustChangePassword, true);
  assert.notEqual(reloginRes.payload?.must_change_password, true);
});

test.after(() => {
  pool.query = originalQuery;
});
