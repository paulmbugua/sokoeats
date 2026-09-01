import '../config/env.js';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

function jwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 16) throw Object.assign(new Error('JWT_SECRET must be configured before authentication can run'), { status: 500 });
  return secret;
}

export function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw Object.assign(new Error('Sign in to continue'), { status: 401 });
    req.auth = jwt.verify(token, jwtSecret());
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      error.status = 401;
      error.message = 'Invalid or expired session';
    }
    next(error);
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.auth) return next(Object.assign(new Error('Sign in to continue'), { status: 401 }));
    if (!roles.includes(req.auth.role)) return next(Object.assign(new Error('This account cannot perform that action'), { status: 403 }));
    next();
  };
}

export async function requireVerifiedVendor(req, _res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT status, verification_status
       FROM sokoeats_vendors
       WHERE owner_user_id = $1
       ORDER BY created_at ASC
       LIMIT 1`,
      [req.auth?.sub],
    );
    const vendor = rows[0];
    if (!vendor || vendor.status !== 'active' || vendor.verification_status !== 'verified') {
      throw Object.assign(new Error('Your store application must be verified before publishing catalogue changes'), { status: 403 });
    }
    req.vendor = vendor;
    next();
  } catch (error) {
    next(error);
  }
}
