import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';

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

function normalizePhone(value) {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('0')) phone = `+254${phone.slice(1)}`;
  else if (phone.startsWith('254')) phone = `+${phone}`;
  return /^\+254[17]\d{8}$/.test(phone) ? phone : null;
}

function createToken(id) {
  return jwt.sign({ id: Number(id), scope: 'ekazi-mobile' }, JWT_SECRET, { expiresIn: '30d' });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'tutor' ? 'handyman' : 'client',
  };
}

async function ensureMobileAuthSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128)');
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
      `INSERT INTO users (name, email, password, role, phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, email, phone, role`,
      [name, email, passwordHash, databaseRole, phone],
    );
    const user = rows[0];
    await ensureHandymanProfile(user);
    return res.status(201).json({ token: createToken(user.id), user: publicUser(user) });
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
      `SELECT id, name, email, phone, password, role
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
  try {
    await ensureMobileAuthSchema();
    const idToken = String(req.body?.idToken || req.body?.token || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const accountType = req.body?.role === 'handyman' ? 'handyman' : 'client';
    const databaseRole = accountType === 'handyman' ? 'tutor' : 'student';

    if (!idToken) return res.status(400).json({ message: 'Google token is required' });

    const payload = await verifyGoogleIdToken(idToken);
    if (!payload) return res.status(401).json({ message: 'Invalid Google sign-in token' });

    const email = String(payload.email).trim().toLowerCase();
    const name = String(payload.name || payload.given_name || email.split('@')[0]).trim();
    const googleId = String(payload.sub);

    const existing = await pool.query(
      `SELECT id, name, email, phone, role, google_id
         FROM users
        WHERE google_id = $1 OR LOWER(email) = $2
        LIMIT 1`,
      [googleId, email],
    );

    let user;
    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE users
            SET google_id = COALESCE(google_id, $2),
                name = CASE WHEN name IS NULL OR name = '' OR name = 'Ekazi User' THEN $3 ELSE name END,
                phone = COALESCE(phone, $4),
                role = COALESCE(role, $5)
          WHERE id = $1
          RETURNING id, name, email, phone, role`,
        [existing.rows[0].id, googleId, name, phone, existing.rows[0].role || databaseRole],
      );
      user = result.rows[0];
    } else {
      const result = await pool.query(
        `INSERT INTO users (name, email, google_id, role, phone)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, phone, role`,
        [name, email, googleId, databaseRole, phone],
      );
      user = result.rows[0];
    }

    await ensureHandymanProfile(user);
    return res.json({ token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    console.error('mobile google auth error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Phone or Google account is already linked' });
    }
    return res.status(401).json({ message: 'Could not verify Google account' });
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
      'SELECT id, name, email, phone, role FROM users WHERE id = $1',
      [userId],
    );
    if (!rows.length) return res.status(401).json({ message: 'User no longer exists' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error('mobile me error:', error);
    return res.status(500).json({ message: 'Could not load account' });
  }
};
