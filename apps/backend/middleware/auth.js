import '../config/env.js';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { hasCurrentTerms, needsPartnerTerms } from '../services/partnerTerms.js';

function jwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 16) throw Object.assign(new Error('JWT_SECRET must be configured before authentication can run'), { status: 500 });
  return secret;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalRole = (role) => ({ courier: 'rider', merchant_admin: 'merchant' }[role] || role);

export async function requireAuth(req, _res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw Object.assign(new Error('Sign in to continue'), { status: 401 });
    const payload = jwt.verify(token, jwtSecret());
    if (!uuidPattern.test(String(payload.sub || '')) || !payload.jti) {
      throw Object.assign(new Error('Invalid or expired session'), { status: 401 });
    }
    const { rows } = await pool.query(
      `SELECT u.id,u.name,u.email,u.phone,u.role,u.status,u.deleted_at,u.application_reference,
              u.partner_terms_version,u.partner_terms_role,u.profile
       FROM sokoeats_users u
       JOIN sokoeats_auth_sessions s ON s.user_id=u.id
       WHERE u.id=$1 AND s.token_id=$2 AND s.revoked_at IS NULL AND s.expires_at>NOW()
       LIMIT 1`,
      [payload.sub, String(payload.jti)],
    );
    const user = rows[0];
    if (!user || user.deleted_at || ['disabled', 'suspended'].includes(user.status)) {
      throw Object.assign(new Error('Your session is no longer active. Please sign in again.'), { status: 401 });
    }
    if (canonicalRole(user.role) !== canonicalRole(payload.role)) {
      throw Object.assign(new Error('Your account access has changed. Please sign in again.'), { status: 401 });
    }
    req.auth = payload;
    req.authUser = user;
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
  return async (req, _res, next) => {
    if (!req.auth) return next(Object.assign(new Error('Sign in to continue'), { status: 401 }));
    if (!roles.map(canonicalRole).includes(canonicalRole(req.auth.role))) return next(Object.assign(new Error('This account cannot perform that action'), { status: 403 }));
    try {
      const supportRequest = /^\/api\/rider\/(live-chat\/messages|incidents)$/.test(req.originalUrl?.split('?')[0] || '');
      if (needsPartnerTerms(req.auth.role) && !supportRequest && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        if (!hasCurrentTerms(req.authUser)) throw Object.assign(new Error('Complete your profile and accept the current terms of service before continuing.'), { status: 403 });
      }
      next();
    } catch (error) { next(error); }
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
      [req.authUser?.id],
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
