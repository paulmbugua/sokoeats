import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ekazi-dev-secret';
let schemaReady;

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
  return { id: user.id, name: user.name, email: user.email, phone: user.phone };
}

async function ensureMobileAuthSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)');
      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx ON users (phone) WHERE phone IS NOT NULL',
      );
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

export const register = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const suppliedEmail = String(req.body?.email || '').trim().toLowerCase();
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
       VALUES ($1, $2, $3, 'student', $4)
       RETURNING id, name, email, phone`,
      [name, email, passwordHash, phone],
    );
    const user = rows[0];
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
      `SELECT id, name, email, phone, password
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
       RETURNING id, name, email, phone`,
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
      'SELECT id, name, email, phone FROM users WHERE id = $1',
      [userId],
    );
    if (!rows.length) return res.status(401).json({ message: 'User no longer exists' });
    return res.json({ user: publicUser(rows[0]) });
  } catch (error) {
    console.error('mobile me error:', error);
    return res.status(500).json({ message: 'Could not load account' });
  }
};
