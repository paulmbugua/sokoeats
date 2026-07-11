import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';
import { sendNotification } from '../utils/sendNotification.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ekazi-dev-secret';
let schemaReady;

const googleClient = new OAuth2Client();
const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  '557799973381-ksp83t2vo6fdqufhm0iie06lnb4e8j8v.apps.googleusercontent.com',
  '557799973381-g0h98g6vg82oeineeb4t9e67hgosdfrg.apps.googleusercontent.com',
  '557799973381-97lsoficotiiulhl5st6tf6h723uurpg.apps.googleusercontent.com',
  '164509786898-7ca20l8gli2hia1d8p06r55v81p9f2nh.apps.googleusercontent.com',
  '164509786898-ujoi1s2k3763bhh5mgtdf6if90bnakjb.apps.googleusercontent.com',
  '164509786898-l6t6vck6qa44s9b2hc609ts3kbihl3sv.apps.googleusercontent.com',
  '164509786898-0scm5333pfeligj0eu15olvlvluf4k6j.apps.googleusercontent.com',
].filter(Boolean);


function googleAuthRequestId() {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function logGoogleAuth(requestId, step, details = {}) {
  console.log('[google-auth][backend]', step, { requestId, ...details });
}

function googleEmailDomain(email) {
  return typeof email === 'string' && email.includes('@') ? email.split('@').pop() : undefined;
}

function decodeJwtPayloadUnsafe(idToken) {
  try {
    const [, payload] = String(idToken || '').split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (error) {
    return { decodeError: error instanceof Error ? error.message : String(error) };
  }
}

function summarizeIncomingGoogleToken(idToken) {
  const token = String(idToken || '');
  const payload = decodeJwtPayloadUnsafe(token);
  return {
    hasToken: Boolean(token),
    tokenLength: token.length,
    partCount: token ? token.split('.').length : 0,
    aud: payload?.aud,
    azp: payload?.azp,
    iss: payload?.iss,
    emailDomain: googleEmailDomain(payload?.email),
    emailVerified: payload?.email_verified,
    exp: payload?.exp,
    iat: payload?.iat,
    decodeError: payload?.decodeError,
  };
}

function normalizePhone(value) {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('0')) phone = `+254${phone.slice(1)}`;
  else if (phone.startsWith('254')) phone = `+${phone}`;
  return /^\+254[17]\d{8}$/.test(phone) ? phone : null;
}

function createToken(id) {
  return jwt.sign({ id: Number(id), scope: 'ekazi-mobile' }, JWT_SECRET, { expiresIn: '30d' });
}

function isProfileComplete(user) {
  return Boolean(user?.phone && user?.profile_completed_at);
}

function profileRequirements(user) {
  const missing = [];
  if (!user?.phone) missing.push('phone');
  if (!user?.name || user.name === 'Ekazi User') missing.push('name');
  if (!user?.profile_completed_at) missing.push('profile_details');
  return missing;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'tutor' ? 'handyman' : 'client',
    emailVerified: Boolean(user.email_verified),
    profileComplete: isProfileComplete(user),
    profileRequiredActions: profileRequirements(user),
    preferredCity: user.preferred_city || null,
    preferredEstate: user.preferred_estate || null,
    contactPreference: user.contact_preference || 'phone',
  };
}

function isSyntheticMobileEmail(email) {
  return /@mobile\.ekazi\.co\.ke$/i.test(String(email || ''));
}

function hashEmailToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function publicApiUrl() {
  return String(
    process.env.PUBLIC_API_URL ||
      process.env.PUBLIC_BACKEND_URL ||
      process.env.PROD_BACKEND_URL ||
      process.env.BACKEND_URL ||
      'https://server.ekazi.co.ke',
  ).replace(/\/+$/, '');
}

function createEmailToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashEmailToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

async function sendEmailConfirmation(user) {
  if (!user?.email || isSyntheticMobileEmail(user.email)) return { sent: false, skipped: true };
  const { token, tokenHash, expiresAt } = createEmailToken();
  await pool.query(
    `UPDATE users
        SET email_verification_token_hash = $1,
            email_verification_expires_at = $2
      WHERE id = $3`,
    [tokenHash, expiresAt, user.id],
  );
  const confirmUrl = `${publicApiUrl()}/api/auth/email/confirm?token=${encodeURIComponent(token)}`;
  await sendNotification({
    to: user.email,
    subject: 'Confirm your Ekazi email',
    kind: 'email_confirmation',
    details: {
      intro: `Hi ${user.name || 'there'}, confirm this email address to secure your Ekazi account.`,
      items: {
        Account: user.email,
        Expires: '24 hours',
      },
      ctaUrl: confirmUrl,
      ctaText: 'Confirm email',
      plainText: `Confirm your Ekazi email by opening this link: ${confirmUrl}\n\nThis link expires in 24 hours.`,
    },
  });
  return { sent: true, expiresAt };
}

async function ensureMobileAuthSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_city TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_estate TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(32)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_preference TEXT');
      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone) WHERE phone IS NOT NULL',
      );
      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique_idx ON users (google_id) WHERE google_id IS NOT NULL',
      );
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureHandymanProfile(user) {
  if (user.role !== 'tutor') return;
  await ensureMarketplaceSchema();
  await pool.query(
    `INSERT INTO ekazi_handyman_profiles (user_id, business_name)
     VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.name],
  );
}

async function verifyGoogleIdToken(idToken) {
  const options = { idToken };
  if (GOOGLE_AUDIENCES.length) options.audience = GOOGLE_AUDIENCES;
  const ticket = await googleClient.verifyIdToken(options);
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) return null;
  return payload;
}

export const register = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const suppliedEmail = String(req.body?.email || '').trim().toLowerCase();
    const accountType = req.body?.role === 'handyman' ? 'handyman' : 'client';
    const databaseRole = accountType === 'handyman' ? 'tutor' : 'student';
    const email = suppliedEmail || (phone ? `${phone.slice(1)}@mobile.ekazi.co.ke` : '');

    if (!name || !phone || !password) {
      return res.status(400).json({
        message: 'Name, a valid Kenyan mobile number, and password are required',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const duplicate = await pool.query(
      'SELECT 1 FROM users WHERE LOWER(email) = $1 OR phone = $2 LIMIT 1',
      [email, phone],
    );
    if (duplicate.rows.length) {
      return res.status(409).json({ message: 'An account already exists for this email or phone' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role, phone, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, email, phone, role, email_verified`,
      [name, email, passwordHash, databaseRole, phone, isSyntheticMobileEmail(email)],
    );
    const user = rows[0];
    await ensureHandymanProfile(user);
    let emailConfirmation = { sent: false };
    try {
      emailConfirmation = await sendEmailConfirmation(user);
    } catch (mailError) {
      console.error('email confirmation send error:', mailError);
      emailConfirmation = { sent: false, error: 'send_failed' };
    }
    return res.status(201).json({
      token: createToken(user.id),
      user: publicUser(user),
      emailConfirmation,
    });
  } catch (error) {
    console.error('mobile register error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Account already exists' });
    }
    return res.status(500).json({ message: 'Could not create account' });
  }
};

export const login = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const loginValue = String(req.body?.phone || req.body?.email || '').trim();
    const phone = normalizePhone(loginValue);
    const email = loginValue.toLowerCase();
    const password = String(req.body?.password || '');

    if (!loginValue || !password) {
      return res.status(400).json({ message: 'Phone or email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, password, role, email_verified
         FROM users
        WHERE ($1::text IS NOT NULL AND phone = $1) OR LOWER(email) = $2
        LIMIT 1`,
      [phone, email],
    );
    const user = rows[0];
    const valid = user?.password && (await bcrypt.compare(password, user.password));
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    return res.json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    console.error('mobile login error:', error);
    return res.status(500).json({ message: 'Could not sign in' });
  }
};

export const googleAuth = async (req, res) => {
  const requestId = googleAuthRequestId();
  res.setHeader('x-ekazi-google-auth-request-id', requestId);
  try {
    await ensureMobileAuthSchema();
    const idToken = String(req.body?.idToken || req.body?.token || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const accountType = req.body?.role === 'handyman' ? 'handyman' : 'client';
    const databaseRole = accountType === 'handyman' ? 'tutor' : 'student';

    logGoogleAuth(requestId, 'request:start', {
      role: accountType,
      databaseRole,
      phoneSupplied: Boolean(phone),
      token: summarizeIncomingGoogleToken(idToken),
      acceptedAudienceCount: GOOGLE_AUDIENCES.length,
    });

    if (!idToken) {
      logGoogleAuth(requestId, 'request:missing_token');
      return res.status(400).json({ message: 'Google token is required', code: 'GOOGLE_TOKEN_MISSING', requestId });
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken(idToken);
      logGoogleAuth(requestId, 'token:verify_ok', {
        aud: payload?.aud,
        azp: payload?.azp,
        iss: payload?.iss,
        emailDomain: googleEmailDomain(payload?.email),
        emailVerified: payload?.email_verified,
      });
    } catch (verifyError) {
      logGoogleAuth(requestId, 'token:verify_error', {
        name: verifyError?.name,
        message: verifyError?.message,
        code: verifyError?.code,
      });
      throw verifyError;
    }
    if (!payload) {
      logGoogleAuth(requestId, 'token:empty_payload');
      return res.status(401).json({ message: 'Invalid Google sign-in token', code: 'GOOGLE_TOKEN_INVALID', requestId });
    }

    const email = String(payload.email).trim().toLowerCase();
    const name = String(payload.name || payload.given_name || email.split('@')[0]).trim();
    const googleId = String(payload.sub);

    logGoogleAuth(requestId, 'user:lookup_start', { emailDomain: googleEmailDomain(email), googleIdSuffix: googleId.slice(-6) });

    const existing = await pool.query(
      `SELECT id, name, email, phone, role, google_id
         FROM users
        WHERE google_id = $1 OR LOWER(email) = $2
        LIMIT 1`,
      [googleId, email],
    );

    logGoogleAuth(requestId, 'user:lookup_ok', { existingCount: existing.rows.length });

    let user;
    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE users
            SET google_id = COALESCE(google_id, $2),
                name = CASE WHEN name IS NULL OR name = '' OR name = 'Ekazi User' THEN $3 ELSE name END,
                phone = COALESCE(phone, $4),
                role = COALESCE(role, $5),
                email_verified = TRUE,
                email_verified_at = COALESCE(email_verified_at, NOW())
          WHERE id = $1
          RETURNING id, name, email, phone, role, email_verified`,
        [existing.rows[0].id, googleId, name, phone, existing.rows[0].role || databaseRole],
      );
      user = result.rows[0];
      logGoogleAuth(requestId, 'user:linked_existing', { userId: user.id, role: user.role });
    } else {
      const result = await pool.query(
        `INSERT INTO users (name, email, google_id, role, phone, email_verified, email_verified_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
         RETURNING id, name, email, phone, role, email_verified`,
        [name, email, googleId, databaseRole, phone],
      );
      user = result.rows[0];
      logGoogleAuth(requestId, 'user:created', { userId: user.id, role: user.role });
    }

    await ensureHandymanProfile(user);
    logGoogleAuth(requestId, 'response:success', { userId: user.id, role: user.role });
    return res.json({ token: createToken(user.id), user: publicUser(user), requestId });
  } catch (error) {
    logGoogleAuth(requestId, 'response:error', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    });
    console.error('mobile google auth error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Phone or Google account is already linked', code: 'GOOGLE_ACCOUNT_CONFLICT', requestId });
    }
    return res.status(401).json({ message: 'Could not verify Google account', code: 'GOOGLE_AUTH_FAILED', requestId });
  }
};


export const confirmEmail = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const token = String(req.query?.token || req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Missing confirmation token' });
    }
    const tokenHash = hashEmailToken(token);
    const { rows } = await pool.query(
      `UPDATE users
          SET email_verified = TRUE,
              email_verified_at = NOW(),
              email_verification_token_hash = NULL,
              email_verification_expires_at = NULL
        WHERE email_verification_token_hash = $1
          AND email_verification_expires_at > NOW()
        RETURNING id, name, email, phone, role, email_verified`,
      [tokenHash],
    );
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'Invalid or expired confirmation link' });
    }
    const wantsHtml = String(req.get?.('accept') || '').includes('text/html') || req.method === 'GET';
    if (wantsHtml) {
      return res
        .status(200)
        .send('<!doctype html><html><body style="font-family:Arial;padding:32px"><h1>Email confirmed</h1><p>Your Ekazi email has been confirmed. You can return to the app.</p></body></html>');
    }
    return res.json({ ok: true, user: publicUser(rows[0]) });
  } catch (error) {
    console.error('confirm email error:', error);
    return res.status(500).json({ ok: false, message: 'Could not confirm email' });
  }
};

export const resendEmailConfirmation = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, role, email_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email_verified) {
      return res.json({ ok: true, alreadyVerified: true, user: publicUser(user) });
    }
    const emailConfirmation = await sendEmailConfirmation(user);
    return res.json({ ok: true, emailConfirmation });
  } catch (error) {
    console.error('resend email confirmation error:', error);
    return res.status(500).json({ message: 'Could not send confirmation email' });
  }
};

export const requestOtp = async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ message: 'A valid Kenyan mobile number is required' });
  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({ message: 'SMS verification is temporarily unavailable' });
  }
  return res.json({ ok: true, phone, otp: '123456' });
};

export const verifyOtp = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '');
    if (!phone || code !== '123456' || process.env.NODE_ENV === 'production') {
      return res.status(400).json({ message: 'Invalid or expired verification code' });
    }

    const email = `${phone.slice(1)}@mobile.ekazi.co.ke`;
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, role, phone)
       VALUES ('Ekazi User', $1, 'student', $2)
       ON CONFLICT (phone) WHERE phone IS NOT NULL
       DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id, name, email, phone, role`,
      [email, phone],
    );
    const user = rows[0];
    return res.json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    console.error('mobile OTP verification error:', error);
    return res.status(500).json({ message: 'Could not verify phone number' });
  }
};

export const me = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, role, email_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference FROM users WHERE id = $1',
      [userId],
    );
    if (!rows.length) return res.status(401).json({ message: 'User no longer exists' });
    const user = rows[0];
    return res.json({
      user: publicUser(user),
      profileComplete: isProfileComplete(user),
      profileRequiredActions: profileRequirements(user),
    });
  } catch (error) {
    console.error('mobile me error:', error);
    return res.status(500).json({ message: 'Could not load account' });
  }
};


export const completeProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMobileAuthSchema();
    await ensureMarketplaceSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const city = String(req.body?.city || 'Nairobi').trim().slice(0, 80);
    const estate = String(req.body?.estate || '').trim().slice(0, 120);
    const emergencyContact = normalizePhone(req.body?.emergencyContact) || null;
    const contactPreference = ['phone', 'whatsapp', 'sms'].includes(String(req.body?.contactPreference || '').toLowerCase())
      ? String(req.body.contactPreference).toLowerCase()
      : 'phone';
    if (name.length < 2) return res.status(400).json({ message: 'Enter your full name.' });
    if (!phone) return res.status(400).json({ message: 'Enter a valid Kenyan phone number.' });

    await client.query('BEGIN');
    const currentResult = await client.query('SELECT id, role FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    const duplicate = await client.query('SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1', [phone, userId]);
    if (duplicate.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This phone number is already used by another Ekazi account.' });
    }

    const userResult = await client.query(
      `UPDATE users
          SET name = $2,
              phone = $3,
              preferred_city = $4,
              preferred_estate = $5,
              emergency_contact = $6,
              contact_preference = $7,
              profile_completed_at = NOW()
        WHERE id = $1
        RETURNING id, name, email, phone, role, email_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference`,
      [userId, name, phone, city, estate || null, emergencyContact, contactPreference],
    );
    const user = userResult.rows[0];

    if (current.role === 'tutor') {
      const businessName = String(req.body?.businessName || name).trim().slice(0, 120);
      const bio = String(req.body?.bio || '').trim().slice(0, 600);
      const categories = Array.isArray(req.body?.categories) ? req.body.categories.map(String).filter(Boolean).slice(0, 8) : [];
      const radius = Number(req.body?.serviceRadiusKm || 20);
      if (!businessName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Business name is required for handymen.' });
      }
      if (!categories.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Select at least one service category.' });
      }
      await client.query(
        `INSERT INTO ekazi_handyman_profiles
           (user_id, business_name, categories, estate, city, service_radius_km, bio, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           business_name = EXCLUDED.business_name,
           categories = EXCLUDED.categories,
           estate = EXCLUDED.estate,
           city = EXCLUDED.city,
           service_radius_km = EXCLUDED.service_radius_km,
           bio = EXCLUDED.bio,
           updated_at = NOW()`,
        [userId, businessName, categories, estate || null, city, Number.isFinite(radius) && radius > 0 ? radius : 20, bio || null],
      );
    }

    await client.query('COMMIT');
    return res.json({
      ok: true,
      user: publicUser(user),
      profileComplete: true,
      profileRequiredActions: [],
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('complete profile error:', error);
    return res.status(500).json({ message: 'Could not save profile details' });
  } finally {
    client.release();
  }
};
