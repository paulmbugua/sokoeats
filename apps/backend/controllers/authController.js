import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';

const SESSION_DAYS = Number(process.env.AUTH_SESSION_DAYS || 30);
const roleAliases = {
  normal: 'customer',
  user: 'customer',
  customer: 'customer',
  rider: 'rider',
  courier: 'rider',
  vendor: 'vendor',
  merchant: 'merchant',
  merchant_admin: 'merchant',
  support: 'support',
  admin: 'admin',
};

function getJwtSecret() {
  const secret = process.env.JWT_SECRET || process.env.AUTH_JWT_SECRET;
  if (!secret || secret.length < 16) {
    const err = new Error('JWT_SECRET must be configured before authentication can run');
    err.status = 500;
    throw err;
  }
  return secret;
}

function normalizeRole(role = 'customer') {
  const normalized = roleAliases[String(role).toLowerCase()];
  if (!normalized) {
    const err = new Error('Unsupported SokoEats account type');
    err.status = 422;
    throw err;
  }
  return normalized;
}

function roleMatches(current, requested) {
  return current === requested || (current === 'courier' && requested === 'rider') || (current === 'rider' && requested === 'courier');
}

function assertSelfRegistrationAllowed(role, body) {
  if (!['support', 'admin'].includes(role)) return;
  const expected = role === 'admin' ? process.env.ADMIN_INVITE_CODE : process.env.SUPPORT_INVITE_CODE;
  if (!expected || body.inviteCode !== expected) {
    const err = new Error('This account type requires a private SokoEats invite code');
    err.status = 403;
    throw err;
  }
}

function cleanEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildProfile(body, role) {
  const base = {
    city: body.city || 'Nairobi',
    preferredLanguage: body.preferredLanguage || 'English',
    source: body.source || 'mobile',
  };
  if (role === 'rider') {
    return { ...base, vehicleType: body.vehicleType || 'Motorbike', onboardingStatus: 'started', payoutMethod: 'M-Pesa' };
  }
  if (role === 'vendor' || role === 'merchant') {
    return {
      ...base,
      businessName: body.businessName || body.storeName || body.fullName || body.name,
      storeAddress: body.storeAddress || body.defaultAddress || '',
      onboardingStatus: role === 'merchant' ? 'merchant_admin_created' : 'vendor_created',
    };
  }
  if (role === 'admin' || role === 'support') {
    return { ...base, department: body.department || (role === 'support' ? 'Support Operations' : 'Operations Admin') };
  }
  return { ...base, defaultAddress: body.defaultAddress || body.address || '', rewardsOptIn: body.marketingOptIn !== false };
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role === 'courier' ? 'rider' : row.role,
    status: row.status,
    authProvider: row.auth_provider,
    avatarUrl: row.avatar_url,
    city: row.city,
    defaultAddress: row.default_address,
    emailVerified: row.email_verified,
    phoneVerified: row.phone_verified,
    profile: row.profile || {},
  };
}

async function createSession(userRow, req, provider) {
  const user = publicUser(userRow);
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email, jti: tokenId }, getJwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  await pool.query(
    `INSERT INTO sokoeats_auth_sessions (user_id, token_id, provider, user_agent, ip_address, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [user.id, tokenId, provider, req.get('user-agent') || null, req.ip || null, expiresAt],
  );
  return { token, expiresAt: expiresAt.toISOString(), user };
}

async function verifyBearer(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    const err = new Error('Missing bearer token');
    err.status = 401;
    throw err;
  }
  return jwt.verify(token, getJwtSecret());
}

function googleClientIds() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_ID_WEB,
    process.env.GOOGLE_CLIENT_ID_ANDROID,
    process.env.GOOGLE_CLIENT_ID_IOS,
  ].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const allowedAudiences = googleClientIds();
  if (!allowedAudiences.length) {
    const err = new Error('Google client IDs are not configured');
    err.status = 500;
    throw err;
  }
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.sub || !payload.email) {
    const err = new Error('Google sign-in could not be verified');
    err.status = 401;
    throw err;
  }
  if (!allowedAudiences.includes(payload.aud)) {
    const err = new Error('Google sign-in was issued for a different client');
    err.status = 401;
    throw err;
  }
  if (!(payload.email_verified === true || payload.email_verified === 'true')) {
    const err = new Error('Google account email is not verified');
    err.status = 401;
    throw err;
  }
  return {
    sub: payload.sub,
    email: cleanEmail(payload.email),
    name: payload.name || payload.given_name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null,
  };
}

export async function register(req, res, next) {
  try {
    const role = normalizeRole(req.body.role);
    assertSelfRegistrationAllowed(role, req.body);
    const email = cleanEmail(req.body.email);
    const name = req.body.fullName || req.body.name || req.body.businessName || email.split('@')[0];
    if (!req.body.password || req.body.password.length < 8) {
      return res.status(422).json({ message: 'Password must be at least 8 characters' });
    }
    const exists = await pool.query(`SELECT id FROM sokoeats_users WHERE email = $1`, [email]);
    if (exists.rows[0]) return res.status(409).json({ message: 'A SokoEats account already exists for this email' });
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const profile = buildProfile(req.body, role);
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_users
        (name, email, phone, role, password_hash, status, auth_provider, city, default_address, email_verified, phone_verified, marketing_opt_in, terms_accepted_at, profile)
       VALUES ($1,$2,$3,$4,$5,$6,'password',$7,$8,false,false,$9,NOW(),$10::jsonb)
       RETURNING *`,
      [name, email, req.body.phone || null, role, passwordHash, role === 'vendor' || role === 'merchant' ? 'review' : 'active', req.body.city || 'Nairobi', req.body.defaultAddress || req.body.address || null, req.body.marketingOptIn !== false, JSON.stringify(profile)],
    );
    res.status(201).json(await createSession(rows[0], req, 'password'));
  } catch (err) {
    if (err?.code === '23505') err.status = 409;
    if (err?.code === '23505') err.message = 'A SokoEats account already exists for this email';
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const email = cleanEmail(req.body.email);
    const role = req.body.role ? normalizeRole(req.body.role) : null;
    const { rows } = await pool.query(`SELECT * FROM sokoeats_users WHERE email = $1`, [email]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ message: 'Invalid email or password' });
    if (role && !roleMatches(user.role, role)) return res.status(403).json({ message: 'This account is registered for a different SokoEats role' });
    const ok = await bcrypt.compare(req.body.password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    const { rows: updated } = await pool.query(`UPDATE sokoeats_users SET last_login_at = NOW() WHERE id = $1 RETURNING *`, [user.id]);
    res.json(await createSession(updated[0], req, 'password'));
  } catch (err) {
    next(err);
  }
}

export async function googleAuth(req, res, next) {
  try {
    const role = normalizeRole(req.body.role);
    assertSelfRegistrationAllowed(role, req.body);
    const googleProfile = await verifyGoogleIdToken(req.body.idToken);
    const profile = buildProfile({ ...req.body, ...googleProfile, source: 'google' }, role);
    const existing = await pool.query(`SELECT * FROM sokoeats_users WHERE email = $1 OR google_sub = $2 ORDER BY created_at ASC LIMIT 1`, [googleProfile.email, googleProfile.sub]);
    if (existing.rows[0] && !roleMatches(existing.rows[0].role, role)) {
      return res.status(409).json({ message: 'This Google account is already linked to a different SokoEats role' });
    }
    let userRow = existing.rows[0];
    if (userRow) {
      const { rows } = await pool.query(
        `UPDATE sokoeats_users SET
          name = COALESCE($2, name),
          auth_provider = 'google',
          google_sub = COALESCE(google_sub, $3),
          avatar_url = COALESCE($4, avatar_url),
          city = COALESCE($5, city),
          default_address = COALESCE($6, default_address),
          email_verified = true,
          marketing_opt_in = COALESCE($7, marketing_opt_in),
          last_login_at = NOW(),
          profile = profile || $8::jsonb
         WHERE id = $1 RETURNING *`,
        [userRow.id, googleProfile.name, googleProfile.sub, googleProfile.avatarUrl, req.body.city || null, req.body.defaultAddress || req.body.address || null, typeof req.body.marketingOptIn === 'boolean' ? req.body.marketingOptIn : null, JSON.stringify(profile)],
      );
      userRow = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO sokoeats_users
          (name, email, phone, role, password_hash, status, auth_provider, google_sub, avatar_url, city, default_address, email_verified, phone_verified, marketing_opt_in, terms_accepted_at, last_login_at, profile)
         VALUES ($1,$2,$3,$4,NULL,$5,'google',$6,$7,$8,$9,true,false,$10,NOW(),NOW(),$11::jsonb)
         RETURNING *`,
        [googleProfile.name, googleProfile.email, req.body.phone || null, role, role === 'vendor' || role === 'merchant' ? 'review' : 'active', googleProfile.sub, googleProfile.avatarUrl, req.body.city || 'Nairobi', req.body.defaultAddress || req.body.address || null, req.body.marketingOptIn !== false, JSON.stringify(profile)],
      );
      userRow = rows[0];
    }
    res.json(await createSession(userRow, req, 'google'));
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const payload = await verifyBearer(req);
    const { rows } = await pool.query(`SELECT * FROM sokoeats_users WHERE id = $1`, [payload.sub]);
    if (!rows[0]) return res.status(401).json({ message: 'Account not found' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Invalid or expired session' });
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  try {
    const payload = await verifyBearer(req);
    const profile = buildProfile(req.body, payload.role);
    const { rows } = await pool.query(
      `UPDATE sokoeats_users SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        city = COALESCE($4, city),
        default_address = COALESCE($5, default_address),
        marketing_opt_in = COALESCE($6, marketing_opt_in),
        profile = profile || $7::jsonb
       WHERE id = $1 RETURNING *`,
      [payload.sub, req.body.fullName || req.body.name || null, req.body.phone || null, req.body.city || null, req.body.defaultAddress || req.body.address || null, typeof req.body.marketingOptIn === 'boolean' ? req.body.marketingOptIn : null, JSON.stringify(profile)],
    );
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Invalid or expired session' });
    next(err);
  }
}