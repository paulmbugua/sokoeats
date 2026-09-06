import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { requireAuth } from '../middleware/auth.js';

const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
if (!secret) throw new Error('JWT_SECRET is required for the auth guard check');

const invoke = (token) => new Promise((resolve) => {
  const req = {
    method: 'PATCH',
    originalUrl: '/api/admin/vendors/test/compliance',
    get: (name) => name.toLowerCase() === 'authorization' ? `Bearer ${token}` : '',
  };
  requireAuth(req, {}, (error) => resolve({ error, req }));
});

let userId;
try {
  const tokenId = crypto.randomUUID();
  const email = `auth-guard-${tokenId}@example.invalid`;
  const user = await pool.query(
    `INSERT INTO sokoeats_users (name,email,role,status)
     VALUES ('Auth guard check',$1,'admin','active') RETURNING id`,
    [email],
  );
  userId = user.rows[0].id;
  await pool.query(
    `INSERT INTO sokoeats_auth_sessions (user_id,token_id,provider,expires_at)
     VALUES ($1,$2,'password',NOW()+INTERVAL '1 hour')`,
    [userId, tokenId],
  );
  const token = jwt.sign({ sub: userId, role: 'admin', email, jti: tokenId }, secret, { expiresIn: '1h' });

  const live = await invoke(token);
  assert.equal(live.error, undefined);
  assert.equal(live.req.authUser.id, userId);

  await pool.query('DELETE FROM sokoeats_users WHERE id=$1', [userId]);
  userId = undefined;
  const stale = await invoke(token);
  assert.equal(stale.error?.status, 401);
  assert.match(stale.error?.message || '', /session/i);
  console.info('[SokoEats][Auth] guard-check-passed');
} finally {
  if (userId) await pool.query('DELETE FROM sokoeats_users WHERE id=$1', [userId]).catch(() => {});
  await pool.end();
}
