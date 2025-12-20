import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const ELEVATED = new Set(['admin', 'superadmin']);

/**
 * Accepts:
 *  - Tokens signed by JWT_SECRET
 *  - payload.id formats:
 *      "admin:<email>"
 *      "superadmin:<email>"
 *      <numeric user id> whose users.role ∈ {'admin','superadmin'}
 *
 * Populates:
 *   req.admin       = { email?, role, userId? }
 *   req.adminRole   = 'admin' | 'superadmin'
 *   req.adminUserId = number (when a user row backs the token)
 */
export async function adminAuth(req, res, next) {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token)
      return res.status(401).json({ success: false, message: 'Missing token' });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = payload?.id;

    // Prefix tokens: "admin:<email>" or "superadmin:<email>"
    if (typeof id === 'string') {
      if (id.startsWith('admin:') || id.startsWith('superadmin:')) {
        const role = id.startsWith('superadmin:') ? 'superadmin' : 'admin';
        const email = id.split(':', 2)[1] || '';
        req.adminRole = role;
        req.admin = { email, role };
        return next();
      }
    }

    // Numeric user id backed by DB role
    const userIdNum = Number(id);
    if (!Number.isFinite(userIdNum)) {
      return res
        .status(403)
        .json({ success: false, message: 'Invalid admin token' });
    }

    const { rows } = await pool.query(
      'SELECT email, role FROM users WHERE id = $1 LIMIT 1',
      [userIdNum],
    );
    const row = rows[0];
    const role = (row?.role || '').toLowerCase();

    if (!row || !ELEVATED.has(role)) {
      return res
        .status(403)
        .json({ success: false, message: 'Admin or Superadmin required' });
    }

    req.adminUserId = userIdNum;
    req.adminRole = role; // 'admin' | 'superadmin'
    req.admin = { email: row.email, role, userId: userIdNum };
    return next();
  } catch (err) {
    console.error('[adminAuth] error', err);
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
}
