import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const notImplemented = (_req, res) =>
  res.status(501).json({ success: false, message: 'Not implemented' });

function isMissingDbObject(error) {
  return ['42P01', '42703'].includes(error?.code);
}

async function queryOrEmpty(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (isMissingDbObject(error)) return { rows: [], rowCount: 0 };
    throw error;
  }
}

export async function listPackages(_req, res) {
  const { rows } = await queryOrEmpty(
    'SELECT * FROM packages ORDER BY credits ASC, currency ASC',
  );
  return res.json({ success: true, packages: rows });
}

export async function upsertPackagePair(req, res) {
  const credits = Number(req.body?.credits ?? req.params?.credits);
  const offer = req.body?.offer ?? null;
  const priceUSD = req.body?.priceUSD ?? req.body?.usd;
  const priceKES = req.body?.priceKES ?? req.body?.kes;

  if (!Number.isFinite(credits) || credits <= 0) {
    return res.status(400).json({ success: false, message: 'Valid credits are required' });
  }

  const rows = [];
  for (const [currency, price] of [
    ['USD', priceUSD],
    ['KES', priceKES],
  ]) {
    if (price == null || price === '') continue;
    const result = await pool.query(
      `INSERT INTO packages (credits, price, currency, offer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (credits, currency)
       DO UPDATE SET price = EXCLUDED.price, offer = EXCLUDED.offer
       RETURNING *`,
      [credits, Number(price), currency, offer],
    );
    rows.push(result.rows[0]);
  }

  return res.status(200).json({ success: true, packages: rows });
}

export const upsertPackage = upsertPackagePair;

export async function updatePackage(req, res) {
  const id = req.params.id;
  const { credits, price, currency, offer } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE packages
        SET credits = COALESCE($2, credits),
            price = COALESCE($3, price),
            currency = COALESCE($4, currency),
            offer = COALESCE($5, offer)
      WHERE id = $1
      RETURNING *`,
    [id, credits ?? null, price ?? null, currency ?? null, offer ?? null],
  );

  if (!rows[0]) return res.status(404).json({ success: false, message: 'Package not found' });
  return res.json({ success: true, package: rows[0] });
}

export async function deletePackage(req, res) {
  const value = req.params.credits ?? req.params.id;
  const byCredits = Boolean(req.params.credits);
  const result = await pool.query(
    byCredits ? 'DELETE FROM packages WHERE credits = $1' : 'DELETE FROM packages WHERE id = $1',
    [value],
  );
  return res.json({ success: true, deleted: result.rowCount });
}

export async function listTransactions(_req, res) {
  const { rows } = await queryOrEmpty(
    `SELECT p.*, u.email, u.name
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 250`,
  );
  return res.json({ success: true, transactions: rows });
}

export async function listFinancialFeed(req, res) {
  return listTransactions(req, res);
}

export async function listUsers(_req, res) {
  const { rows } = await queryOrEmpty(
    `SELECT id, email, name, role, tokens, created_at
       FROM users
      ORDER BY created_at DESC
      LIMIT 500`,
  );
  return res.json({ success: true, users: rows });
}

export async function adminSetRole(req, res) {
  const { userId, role } = req.body || {};
  if (!userId || !role) {
    return res.status(400).json({ success: false, message: 'userId and role are required' });
  }
  const { rows } = await pool.query(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, name, role',
    [userId, role],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminAdjustTokens(req, res) {
  const { userId } = req.body || {};
  const delta = Number(req.body?.delta ?? req.body?.amount ?? 0);
  if (!userId || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, message: 'userId and numeric delta are required' });
  }
  const { rows } = await pool.query(
    'UPDATE users SET tokens = COALESCE(tokens, 0) + $2 WHERE id = $1 RETURNING id, email, tokens',
    [userId, delta],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminDeleteUser(req, res) {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  return res.json({ success: true, deleted: result.rowCount });
}

export async function adminResetPassword(req, res) {
  const password = req.body?.password;
  if (!password || String(password).length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  const hashed = await bcrypt.hash(String(password), 10);
  const { rows } = await pool.query(
    'UPDATE users SET password = $2 WHERE id = $1 RETURNING id, email',
    [req.params.id, hashed],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminImpersonateUser(req, res) {
  const { rows } = await pool.query(
    'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
    [req.params.id],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, impersonated: true },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' },
  );
  return res.json({ success: true, token });
}

export const proofOfFulfillment = notImplemented;
