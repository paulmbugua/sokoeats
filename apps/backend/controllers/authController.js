import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import { exchangeGoogleWebCode, googleWebCredentials } from '../services/googleWebOAuth.js';
import { hasCurrentTerms, recordTermsAcceptance, validateTermsAcceptance } from '../services/partnerTerms.js';

let firebaseAuthInstance;

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
    city: body.city || '',
    preferredLanguage: body.preferredLanguage || 'English',
    source: body.source || 'mobile',
  };
  if (role === 'rider') {
    return {
      ...base,
      vehicleType: body.vehicleType || '',
      registrationNumber: body.registrationNumber || body.vehicleRegistration || '',
      nationalId: body.nationalId || '',
      onboardingStatus: body.registrationNumber || body.vehicleRegistration ? 'details_submitted' : 'started',
      payoutMethod: 'M-Pesa',
      payoutPhone: body.payoutPhone || body.phone || '',
    };
  }
  if (role === 'vendor' || role === 'merchant') {
    return {
      ...base,
      businessName: body.businessName || body.storeName || '',
      businessCategory: body.businessCategory || body.category || '',
      storeAddress: body.storeAddress || body.defaultAddress || body.address || '',
      payoutMethod: 'M-Pesa',
      payoutPhone: body.payoutPhone || body.phone || '',
      onboardingStatus: body.businessName && body.storeAddress ? 'details_submitted' : role === 'merchant' ? 'merchant_admin_created' : 'vendor_created',
    };
  }
  if (role === 'admin' || role === 'support') {
    return { ...base, department: body.department || (role === 'support' ? 'Support Operations' : 'Operations Admin') };
  }
  return { ...base, defaultAddress: body.defaultAddress || body.address || '', rewardsOptIn: body.marketingOptIn !== false };
}

function valuePresent(value) {
  return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
}

function profileValue(row, key) {
  const profile = row.profile || {};
  if (key === 'phone') return row.phone;
  if (key === 'city') return row.city || profile.city;
  if (key === 'defaultAddress') return row.default_address || profile.defaultAddress || profile.address;
  return profile[key];
}

function requiredProfileFields(role) {
  if (role === 'rider') return ['phone', 'city', 'vehicleType', 'registrationNumber'];
  if (role === 'vendor' || role === 'merchant') return ['phone', 'city', 'businessName', 'storeAddress'];
  if (role === 'customer') return ['phone', 'city', 'defaultAddress'];
  return [];
}

function profileCompletion(row) {
  const role = row.role === 'courier' ? 'rider' : row.role;
  const missing = requiredProfileFields(role).filter((field) => !valuePresent(profileValue(row, field)));
  if (!hasCurrentTerms(row)) missing.push('termsAcceptance');
  return { profileComplete: missing.length === 0, missingProfileFields: missing };
}

function publicUser(row) {
  const completion = profileCompletion(row);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role === 'courier' ? 'rider' : row.role,
    status: row.status,
    applicationReference: row.application_reference || null,
    authProvider: row.auth_provider,
    avatarUrl: row.avatar_url,
    city: row.city,
    defaultAddress: row.default_address,
    emailVerified: row.email_verified,
    phoneVerified: row.phone_verified,
    profileComplete: completion.profileComplete,
    termsAccepted: hasCurrentTerms(row),
    termsVersion: row.partner_terms_version || null,
    missingProfileFields: completion.missingProfileFields,
    profile: row.profile || {},
  };
}

async function createSession(userRow, req, provider, db = pool) {
  const user = publicUser(userRow);
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const token = jwt.sign({ sub: user.id, role: user.role, email: user.email, jti: tokenId }, getJwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  await db.query(
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

async function getFirebaseAuth() {
  if (firebaseAuthInstance) return firebaseAuthInstance;
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
  if (!projectId) {
    const err = new Error('FIREBASE_PROJECT_ID is not configured');
    err.status = 500;
    throw err;
  }
  const [{ initializeApp, getApps }, { getAuth }] = await Promise.all([import('firebase-admin/app'), import('firebase-admin/auth')]);
  const app = getApps()[0] || initializeApp({ projectId });
  firebaseAuthInstance = getAuth(app);
  return firebaseAuthInstance;
}

async function verifyFirebaseIdToken(idToken) {
  const auth = await getFirebaseAuth();
  const payload = await auth.verifyIdToken(idToken);
  if (!payload.uid || !payload.email) {
    const err = new Error('Firebase sign-in could not be verified');
    err.status = 401;
    throw err;
  }
  if (!(payload.email_verified === true || payload.firebase?.sign_in_provider === 'google.com')) {
    const err = new Error('Firebase account email is not verified');
    err.status = 401;
    throw err;
  }
  return {
    sub: payload.uid,
    email: cleanEmail(payload.email),
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture || null,
    issuer: 'firebase',
  };
}

async function verifyGoogleIdToken(idToken) {
  try {
    return await verifyFirebaseIdToken(idToken);
  } catch (firebaseErr) {
    if (process.env.AUTH_GOOGLE_FALLBACK === 'false') throw firebaseErr;
  }

  const allowedAudiences = googleClientIds();
  if (!allowedAudiences.length) {
    const err = new Error('Google client IDs are not configured');
    err.status = 500;
    throw err;
  }
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.sub || !payload.email) {
    const err = new Error('Google sign-in could not be verified by Firebase or Google');
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
    issuer: 'google',
  };
}

function vendorShopType(category) {
  const value = String(category || '').toLowerCase();
  if (value.includes('grocer')) return 'groceries';
  if (value.includes('pharm') || value.includes('chemist')) return 'pharmacy';
  if (value.includes('gas') || value.includes('lpg')) return 'gas';
  if (value.includes('elect')) return 'electronics';
  return 'restaurants';
}

function slugify(value) {
  return String(value || 'sokoeats-shop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

async function ensureVendorForUser(userRow, db = pool) {
  if (!['vendor', 'merchant'].includes(userRow.role)) return;
  const completion = profileCompletion(userRow);
  if (!completion.profileComplete) return;
  const profile = userRow.profile || {};
  const businessName = profile.businessName || userRow.name;
  const shopType = vendorShopType(profile.businessCategory);
  const baseSlug = slugify(businessName);
  const owned = await db.query('SELECT id FROM sokoeats_vendors WHERE owner_user_id = $1::uuid ORDER BY created_at LIMIT 1', [userRow.id]);
  if (owned.rows[0]) {
    await db.query(
      `UPDATE sokoeats_vendors SET name = $2, cuisine = $3, address = $4, shop_type = $5, tagline = $6,
       city_id = COALESCE(city_id,(SELECT id FROM sokoeats_cities WHERE lower(name)=lower($7) LIMIT 1)),updated_at = NOW() WHERE id = $1`,
      [owned.rows[0].id, businessName, profile.businessCategory || shopType, profile.storeAddress || userRow.default_address, shopType, profile.tagline || null, userRow.city || profile.city || 'Nairobi'],
    );
  } else {
    await db.query(
      `INSERT INTO sokoeats_vendors (name, slug, cuisine, address, status, shop_type, tagline, owner_user_id,city_id)
       VALUES ($1,$2 || '-' || substr($3::text,1,8),$4,$5,'review',$6,$7,$3::uuid,(SELECT id FROM sokoeats_cities WHERE lower(name)=lower($8) LIMIT 1))`,
      [businessName, baseSlug, userRow.id, profile.businessCategory || shopType, profile.storeAddress || userRow.default_address, shopType, profile.tagline || null, userRow.city || profile.city || 'Nairobi'],
    );
  }
}

function allowedWebReturnUrl(raw) {
  const fallback = process.env.WEB_APP_URL || 'http://localhost:3000';
  let target;
  try { target = new URL(raw || fallback); } catch { target = new URL(fallback); }
  const allowed = new Set([
    fallback,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...(process.env.WEB_RETURN_ORIGINS || '').split(','),
  ].filter(Boolean).map((entry) => {
    try { return new URL(entry).origin; } catch { return ''; }
  }));
  return allowed.has(target.origin) ? target.toString() : fallback;
}

function googleWebRedirectUri(req) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const publicBase = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const url = new URL(publicBase);
  if (url.hostname === '127.0.0.1') url.hostname = 'localhost';
  url.pathname = '/api/auth/google/callback';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function register(req, res, next) {
  const client = await pool.connect();
  try {
    const role = normalizeRole(req.body.role);
    assertSelfRegistrationAllowed(role, req.body);
    validateTermsAcceptance(role, req.body.termsAcceptance);
    const email = cleanEmail(req.body.email);
    const name = req.body.fullName || req.body.name || req.body.businessName || email.split('@')[0];
    if (!req.body.password || req.body.password.length < 8) {
      return res.status(422).json({ message: 'Password must be at least 8 characters' });
    }
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const profile = buildProfile(req.body, role);
    await client.query('BEGIN');
    const exists = await client.query(`SELECT id FROM sokoeats_users WHERE email = $1`, [email]);
    if (exists.rows[0]) throw Object.assign(new Error('A SokoEats account already exists for this email'), { status: 409 });
    const { rows } = await client.query(
      `INSERT INTO sokoeats_users
        (name, email, phone, role, password_hash, status, auth_provider, city, default_address, email_verified, phone_verified, marketing_opt_in, terms_accepted_at, profile)
       VALUES ($1,$2,$3,$4,$5,$6,'password',$7,$8,false,false,$9,NULL,$10::jsonb)
       RETURNING *`,
      [name, email, req.body.phone || null, role, passwordHash, role === 'vendor' || role === 'merchant' ? 'review' : 'active', req.body.city || 'Nairobi', req.body.defaultAddress || req.body.address || null, req.body.marketingOptIn !== false, JSON.stringify(profile)],
    );
    const acceptedUser = await recordTermsAcceptance(client, rows[0], req.body.termsAcceptance);
    await ensureVendorForUser(acceptedUser, client);
    const session = await createSession(acceptedUser, req, 'password', client);
    await client.query('COMMIT');
    res.status(201).json(session);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err?.code === '23505') err.status = 409;
    if (err?.code === '23505') err.message = 'A SokoEats account already exists for this email';
    next(err);
  } finally { client.release(); }
}

export async function login(req, res, next) {
  try {
    const email = cleanEmail(req.body.email);
    const role = req.body.role ? normalizeRole(req.body.role) : null;
    const { rows } = await pool.query(`SELECT * FROM sokoeats_users WHERE email = $1`, [email]);
    const user = rows[0];
    if (!user || !user.password_hash) return res.status(401).json({ message: 'Invalid email or password' });
    if (user.deleted_at || user.status === 'disabled') return res.status(403).json({ message: 'This SokoEats account is no longer active' });
    if (role && !roleMatches(user.role, role)) return res.status(403).json({ message: 'This account is registered for a different SokoEats role' });
    const ok = await bcrypt.compare(req.body.password, user.password_hash);
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });
    const { rows: updated } = await pool.query(`UPDATE sokoeats_users SET last_login_at = NOW() WHERE id = $1 RETURNING *`, [user.id]);
    await ensureVendorForUser(updated[0]);
    res.json(await createSession(updated[0], req, 'password'));
  } catch (err) {
    next(err);
  }
}

export async function googleAuth(req, res, next) {
  try {
    const role = normalizeRole(req.body.role);
    if (!['customer', 'rider'].includes(role)) {
      return res.status(403).json({ message: 'Google sign-in is available for buyers and riders. Store partners must submit a business application.' });
    }
    const googleProfile = await verifyFirebaseIdToken(req.body.idToken);
    const existing = await pool.query(`SELECT * FROM sokoeats_users WHERE email = $1 OR google_sub = $2 ORDER BY created_at ASC LIMIT 1`, [googleProfile.email, googleProfile.sub]);
    if (existing.rows[0]?.deleted_at || existing.rows[0]?.status === 'disabled') return res.status(403).json({ message: 'This SokoEats account is no longer active' });
    if (existing.rows[0] && !roleMatches(existing.rows[0].role, role)) {
      return res.status(409).json({ message: 'This Google account is already linked to a different SokoEats role' });
    }
    if (!existing.rows[0]) assertSelfRegistrationAllowed(role, req.body);
    const profile = buildProfile({ ...req.body, ...googleProfile, source: 'google' }, role);
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
        [userRow.id, googleProfile.name, googleProfile.sub, googleProfile.avatarUrl, req.body.city || null, req.body.defaultAddress || req.body.address || req.body.storeAddress || null, typeof req.body.marketingOptIn === 'boolean' ? req.body.marketingOptIn : null, JSON.stringify(profile)],
      );
      userRow = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO sokoeats_users
          (name, email, phone, role, password_hash, status, auth_provider, google_sub, avatar_url, city, default_address, email_verified, phone_verified, marketing_opt_in, terms_accepted_at, last_login_at, profile)
         VALUES ($1,$2,$3,$4,NULL,$5,'google',$6,$7,$8,$9,true,false,$10,NULL,NOW(),$11::jsonb)
         RETURNING *`,
        [googleProfile.name, googleProfile.email, req.body.phone || null, role, role === 'vendor' || role === 'merchant' ? 'review' : 'active', googleProfile.sub, googleProfile.avatarUrl, req.body.city || null, req.body.defaultAddress || req.body.address || req.body.storeAddress || null, req.body.marketingOptIn !== false, JSON.stringify(profile)],
      );
      userRow = rows[0];
    }
    await ensureVendorForUser(userRow);
    res.json(await createSession(userRow, req, 'google'));
  } catch (err) {
    next(err);
  }
}

export async function me(req, res, next) {
  try {
    const payload = await verifyBearer(req);
    const { rows } = await pool.query(`SELECT * FROM sokoeats_users WHERE id = $1`, [payload.sub]);
    if (!rows[0] || rows[0].deleted_at || rows[0].status === 'disabled') return res.status(401).json({ message: 'Account is no longer active' });
    await ensureVendorForUser(rows[0]);
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Invalid or expired session' });
    next(err);
  }
}

export async function updateProfile(req, res, next) {
  const client = await pool.connect();
  try {
    const payload = await verifyBearer(req);
    await client.query('BEGIN');
    const existing = await client.query('SELECT * FROM sokoeats_users WHERE id=$1 FOR UPDATE', [payload.sub]);
    if (!existing.rows[0] || existing.rows[0].deleted_at || existing.rows[0].status === 'disabled') throw Object.assign(new Error('Account is no longer active'), { status: 401 });
    if (!hasCurrentTerms(existing.rows[0]) || req.body.termsAcceptance) validateTermsAcceptance(existing.rows[0].role, req.body.termsAcceptance);
    const profile = Object.keys(req.body).every((key) => key === 'termsAcceptance') ? {} : buildProfile(req.body, payload.role);
    const { rows } = await client.query(
      `UPDATE sokoeats_users SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        city = COALESCE($4, city),
        default_address = COALESCE($5, default_address),
        marketing_opt_in = COALESCE($6, marketing_opt_in),
        profile = profile || $7::jsonb
       WHERE id = $1 RETURNING *`,
      [payload.sub, req.body.fullName || req.body.name || null, req.body.phone || null, req.body.city || null, req.body.defaultAddress || req.body.address || req.body.storeAddress || null, typeof req.body.marketingOptIn === 'boolean' ? req.body.marketingOptIn : null, JSON.stringify(profile)],
    );
    const user = req.body.termsAcceptance ? await recordTermsAcceptance(client, rows[0], req.body.termsAcceptance) : rows[0];
    await ensureVendorForUser(user, client);
    await client.query('COMMIT');
    res.json({ user: publicUser(user) });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Invalid or expired session' });
    next(err);
  } finally { client.release(); }
}

export async function changePassword(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM sokoeats_users WHERE id=$1 FOR UPDATE', [req.authUser.id]);
    const user = rows[0];
    if (!user?.password_hash) throw Object.assign(new Error('This account does not use password sign-in.'), { status: 409 });
    if (!await bcrypt.compare(req.body.currentPassword, user.password_hash)) {
      throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });
    }
    if (await bcrypt.compare(req.body.newPassword, user.password_hash)) {
      throw Object.assign(new Error('Choose a new password that you have not used for this account.'), { status: 422 });
    }
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    const updated = await client.query(
      `UPDATE sokoeats_users SET password_hash=$2,
       profile=jsonb_set(COALESCE(profile,'{}'::jsonb),'{mustChangePassword}','false'::jsonb,true)
       WHERE id=$1 RETURNING *`,
      [user.id, passwordHash],
    );
    await client.query(
      'UPDATE sokoeats_auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND token_id<>$2 AND revoked_at IS NULL',
      [user.id, req.auth.jti],
    );
    await client.query('COMMIT');
    console.info('[SokoEats][Auth] password-changed', { userId: user.id, role: user.role });
    res.json({ user: publicUser(updated.rows[0]), message: 'Password changed. Other signed-in devices have been logged out.' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    next(error);
  } finally {
    client.release();
  }
}

export async function deleteAccount(req, res, next) {
  const client = await pool.connect();
  let firebaseUid = null;
  try {
    const payload = await verifyBearer(req);
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM sokoeats_users WHERE id=$1 FOR UPDATE', [payload.sub]);
    const user = result.rows[0];
    if (!user || user.deleted_at) throw Object.assign(new Error('Account is already deleted'), { status: 404 });
    if (['admin','support'].includes(user.role)) throw Object.assign(new Error('Staff accounts must be disabled by another platform administrator'), { status: 403 });
    if (user.password_hash) {
      const valid = req.body.password && await bcrypt.compare(req.body.password, user.password_hash);
      if (!valid) throw Object.assign(new Error('Enter your current password to delete this account'), { status: 401 });
    }
    const active = await client.query(`SELECT COUNT(*)::int AS count FROM sokoeats_orders o
      LEFT JOIN sokoeats_vendors v ON v.id=o.vendor_id
      WHERE (o.customer_user_id=$1 OR o.rider_user_id=$1 OR v.owner_user_id=$1)
        AND o.status NOT IN ('delivered','cancelled')`, [user.id]);
    if (active.rows[0].count > 0) throw Object.assign(new Error('Complete or cancel active orders before deleting your account'), { status: 409 });
    firebaseUid = user.auth_provider === 'google' ? user.google_sub : null;
    const deletedEmail = `deleted+${user.id}@accounts.sokoeats.invalid`;
    await client.query(`UPDATE sokoeats_users SET
      name='Deleted SokoEats user', email=$2, phone=NULL, password_hash=NULL, google_sub=NULL,
      avatar_url=NULL, city=NULL, default_address=NULL, email_verified=false, phone_verified=false,
      marketing_opt_in=false, profile='{}'::jsonb, status='disabled', deletion_requested_at=NOW(),
      deleted_at=NOW(), deletion_reason=$3
      WHERE id=$1`, [user.id, deletedEmail, req.body.reason || null]);
    await client.query('UPDATE sokoeats_auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [user.id]);
    await client.query("UPDATE sokoeats_vendors SET status='paused' WHERE owner_user_id=$1 AND status <> 'draft'", [user.id]);
    await client.query('COMMIT');
    if (firebaseUid) {
      getFirebaseAuth().then((auth) => auth.deleteUser(firebaseUid)).catch((error) => console.warn('[SokoEats][Auth] Firebase identity cleanup deferred', { message: error.message }));
    }
    console.info('[SokoEats][Auth] account-deleted', { userId: user.id, role: user.role });
    res.json({ deleted: true, message: 'Your SokoEats account and personal profile have been deleted.' });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Invalid or expired session' });
    next(err);
  } finally { client.release(); }
}

export async function beginGoogleWebAuth(req, res, next) {
  try {
    const { clientId } = googleWebCredentials();
    const redirectUri = googleWebRedirectUri(req);
    const returnTo = allowedWebReturnUrl(req.query.returnTo);
    const role = normalizeRole(req.query.role || 'customer');
    if (!['customer', 'rider'].includes(role)) throw Object.assign(new Error('Google sign-in is available for buyers and riders only'), { status: 403 });
    console.info('[SokoEats][Auth] google-web:start', { redirectUri, returnTo, role });
    const state = jwt.sign({ purpose: 'google-web', role, returnTo, nonce: crypto.randomUUID() }, getJwtSecret(), { expiresIn: '10m' });
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account', access_type: 'offline' });
    res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (err) { next(err); }
}

export async function googleWebCallback(req, res) {
  let returnTo = allowedWebReturnUrl();
  try {
    const state = jwt.verify(String(req.query.state || ''), getJwtSecret());
    if (state.purpose !== 'google-web') throw new Error('Invalid OAuth state');
    returnTo = allowedWebReturnUrl(state.returnTo);
    if (req.query.error) throw new Error(String(req.query.error_description || req.query.error));
    const redirectUri = googleWebRedirectUri(req);
    const idToken = await exchangeGoogleWebCode({ code: String(req.query.code || ''), redirectUri });
    const googleProfile = await verifyGoogleIdToken(idToken);
    const existing = await pool.query('SELECT * FROM sokoeats_users WHERE email = $1 OR google_sub = $2 ORDER BY created_at ASC LIMIT 1', [googleProfile.email, googleProfile.sub]);
    const role = normalizeRole(state.role || 'customer');
    if (!['customer', 'rider'].includes(role)) throw new Error('Unsupported Google account role');
    if (existing.rows[0] && !roleMatches(existing.rows[0].role, role)) throw new Error('This Google account is registered for a different SokoEats role');
    let userRow = existing.rows[0];
    if (userRow) {
      const updated = await pool.query(`UPDATE sokoeats_users SET name = COALESCE($2,name), auth_provider = 'google', google_sub = COALESCE(google_sub,$3), avatar_url = COALESCE($4,avatar_url), email_verified = true, last_login_at = NOW() WHERE id = $1 RETURNING *`, [userRow.id, googleProfile.name, googleProfile.sub, googleProfile.avatarUrl]);
      userRow = updated.rows[0];
    } else {
      const created = await pool.query(`INSERT INTO sokoeats_users (name,email,role,status,auth_provider,google_sub,avatar_url,email_verified,marketing_opt_in,terms_accepted_at,last_login_at,profile) VALUES ($1,$2,$3,'active','google',$4,$5,true,false,NULL,NOW(),'{}'::jsonb) RETURNING *`, [googleProfile.name, googleProfile.email, role, googleProfile.sub, googleProfile.avatarUrl]);
      userRow = created.rows[0];
    }
    const session = await createSession(userRow, req, 'google-web');
    const handoff = await pool.query(`INSERT INTO sokoeats_auth_handoffs (session_payload, expires_at) VALUES ($1, NOW() + INTERVAL '5 minutes') RETURNING id`, [session]);
    const target = new URL(returnTo);
    target.searchParams.set('auth_code', handoff.rows[0].id);
    res.redirect(302, target.toString());
  } catch (err) {
    const target = new URL(returnTo);
    target.searchParams.set('auth_error', err.message || 'Google sign-in failed');
    res.redirect(302, target.toString());
  }
}

export async function exchangeGoogleWebHandoff(req, res, next) {
  try {
    const { rows } = await pool.query(`UPDATE sokoeats_auth_handoffs SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW() RETURNING session_payload`, [req.body.code]);
    if (!rows[0]) return res.status(401).json({ message: 'Google sign-in link is invalid or expired' });
    res.json(rows[0].session_payload);
  } catch (err) { next(err); }
}
