import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { sendOTP } from '../config/emailService.js';

const TOKEN_TTL = '1d';
const ELEVATED = new Set(['admin', 'superadmin']);

function signUserToken(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

// ─────────────────────────────────────────────────────────
// Schema discovery (cached) so we never reference missing columns
// ─────────────────────────────────────────────────────────
let _schema = null;
async function getUserSchema() {
  if (_schema) return _schema;
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='users'
  `);
  const have = (c) => rows.some((r) => r.column_name === c);

  _schema = {
    hasId: have('id'),
    hasEmail: have('email'),
    hasName: have('name'),
    hasRole: have('role'),
    hasIsAdmin: have('is_admin'),
    hasPwdHash: have('password_hash'),
    hasPwd: have('password'),
    hasCreatedAt: have('created_at'),
    hasUpdatedAt: have('updated_at'),
    hasResetOtp: have('reset_otp'),
    hasOtpExpiry: have('otp_expiry'),
  };
  return _schema;
}

function isBcrypt(str) {
  return typeof str === 'string' && /^\$2[aby]\$\d{2}\$/.test(str);
}

// ─────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────
export async function login(req, res) {
  try {
    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password required' });
    }

    const s = await getUserSchema();

    // Choose available password column
    const pwdCol = s.hasPwdHash
      ? 'password_hash'
      : s.hasPwd
        ? 'password'
        : null;
    if (!pwdCol) {
      return res.status(500).json({
        success: false,
        message: 'No password column on users table.',
      });
    }

    // Build SELECT safely without referencing missing columns
    const selectRole = s.hasRole ? 'role' : `'admin' AS role`;
    const sql = `
      SELECT id, email, ${selectRole} AS role, ${pwdCol} AS pwd
      FROM users
      WHERE LOWER(email) = LOWER($1)
      ${s.hasRole ? "AND role IN ('admin','superadmin')" : s.hasIsAdmin ? 'AND is_admin = TRUE' : ''}
      LIMIT 1
    `;
    const { rows } = await pool.query(sql, [email]);
    const user = rows[0];

    // Hide existence
    if (!user || !user.pwd) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    // Verify password (supports bcrypt or legacy plaintext)
    let ok = false;
    if (isBcrypt(user.pwd)) {
      ok = await bcrypt.compare(password, user.pwd);
    } else {
      ok = password === user.pwd;
      // Upgrade to bcrypt on successful legacy match
      if (ok) {
        const hashed = await bcrypt.hash(password, 12);
        if (s.hasPwdHash) {
          await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
            hashed,
            user.id,
          ]);
        } else if (s.hasPwd) {
          await pool.query('UPDATE users SET password=$1 WHERE id=$2', [
            hashed,
            user.id,
          ]);
        }
      }
    }

    if (!ok)
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });

    const token = signUserToken(user.id);
    return res.json({ success: true, token, role: user.role || null });
  } catch (err) {
    if (err?.code === '42703') {
      return res.status(500).json({
        success: false,
        message:
          'Schema mismatch: backend referenced a missing column on users table.',
      });
    }
    console.error('[auth][login] error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────
// CREATE STAFF (superadmin-only), adapts to schema
// ─────────────────────────────────────────────────────────
export async function createStaff(req, res) {
  try {
    if (req.adminRole !== 'superadmin') {
      return res
        .status(403)
        .json({ success: false, message: 'Superadmin required' });
    }

    const email = String(req.body?.email || '')
      .trim()
      .toLowerCase();
    const name = String(req.body?.name || '').trim() || null;
    const role = String(req.body?.role || '')
      .trim()
      .toLowerCase();
    const tempPassword = String(req.body?.tempPassword || '');

    if (!email)
      return res
        .status(400)
        .json({ success: false, message: 'Email required' });
    if (!['admin', 'tutor', 'student', 'superadmin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const s = await getUserSchema();

    // unique email
    const exists = await pool.query(
      'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email],
    );
    if (exists.rows[0]) {
      return res
        .status(409)
        .json({ success: false, message: 'Email already exists' });
    }

    const passwordToUse =
      tempPassword ||
      Math.random().toString(36).slice(-10) +
        Math.random().toString(36).slice(-4);
    const hash = await bcrypt.hash(passwordToUse, 12);

    // Build dynamic INSERT
    const cols = ['email'];
    const vals = [email];
    const placeholders = ['$1'];
    let idx = 2;

    if (s.hasName) {
      cols.push('name');
      vals.push(name);
      placeholders.push(`$${idx++}`);
    }

    if (s.hasRole) {
      cols.push('role');
      vals.push(role);
      placeholders.push(`$${idx++}`);
    } else if (s.hasIsAdmin) {
      cols.push('is_admin');
      vals.push(role === 'admin' || role === 'superadmin');
      placeholders.push(`$${idx++}`);
    }

    if (s.hasPwdHash) {
      cols.push('password_hash');
      vals.push(hash);
      placeholders.push(`$${idx++}`);
    } else if (s.hasPwd) {
      cols.push('password');
      vals.push(hash); // store hashed even if column is named "password"
      placeholders.push(`$${idx++}`);
    } else {
      return res.status(500).json({
        success: false,
        message: 'No password column on users table.',
      });
    }

    if (s.hasCreatedAt) {
      cols.push('created_at');
      vals.push(new Date());
      placeholders.push(`$${idx++}`);
    }
    if (s.hasUpdatedAt) {
      cols.push('updated_at');
      vals.push(new Date());
      placeholders.push(`$${idx++}`);
    }

    const insertSql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING id, email ${s.hasRole ? ', role' : ''} ${s.hasName ? ', name' : ''}
    `;
    const ins = await pool.query(insertSql, vals);

    // Optional: send OTP if columns exist
    try {
      if (s.hasResetOtp && s.hasOtpExpiry) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await pool.query(
          `UPDATE users SET reset_otp=$1, otp_expiry=NOW() + INTERVAL '10 minutes' WHERE id=$2`,
          [otp, ins.rows[0].id],
        );
        await sendOTP(email, otp);
      }
    } catch (e) {
      console.warn('[auth][createStaff] OTP step skipped:', e?.message);
    }

    return res.status(201).json({ success: true, user: ins.rows[0] });
  } catch (err) {
    if (err?.code === '42703') {
      return res.status(500).json({
        success: false,
        message:
          'Schema mismatch: backend referenced a missing column on users table.',
      });
    }
    console.error('[auth][createStaff] error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────
// ENV-based admin login (unchanged)
// ─────────────────────────────────────────────────────────
export async function adminEnvLogin(req, res) {
  try {
    const { email, password } = req.body || {};
    const envEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
    const envPass = String(process.env.ADMIN_PASSWORD || '');

    if (
      !email ||
      !password ||
      email.toLowerCase() !== envEmail ||
      password !== envPass
    ) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    const role =
      (process.env.ADMIN_ROLE || 'superadmin').toLowerCase() === 'admin'
        ? 'admin'
        : 'superadmin';

    const token = jwt.sign(
      { id: `${role}:${envEmail}` },
      process.env.JWT_SECRET,
      { expiresIn: TOKEN_TTL },
    );
    return res.json({ success: true, token, role });
  } catch (err) {
    console.error('[auth][adminEnvLogin] error', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

// ─────────────────────────────────────────────────────────
// Bootstrap: ensure at least one superadmin exists
// ─────────────────────────────────────────────────────────
export async function ensureSeedSuperadmin() {
  try {
    const s = await getUserSchema();

    // Check for an elevated user
    let checkSql = '';
    if (s.hasRole) {
      checkSql =
        "SELECT id FROM users WHERE LOWER(role) = 'superadmin' LIMIT 1";
    } else if (s.hasIsAdmin) {
      checkSql = 'SELECT id FROM users WHERE is_admin = TRUE LIMIT 1';
    } else {
      checkSql = 'SELECT id FROM users LIMIT 1'; // no role/is_admin columns -> just skip seeding
    }

    const { rows } = await pool.query(checkSql);
    if (rows[0]) return;

    const envEmail = String(process.env.ADMIN_EMAIL || '').toLowerCase();
    const envPass = String(process.env.ADMIN_PASSWORD || '');
    if (!envEmail || !envPass) {
      console.warn(
        '[auth][seed] No elevated user and no ADMIN_EMAIL/ADMIN_PASSWORD set.',
      );
      return;
    }

    const hash = await bcrypt.hash(envPass, 12);

    // Build dynamic INSERT for seed
    const cols = ['email'];
    const vals = [envEmail];
    const placeholders = ['$1'];
    let idx = 2;

    if (s.hasRole) {
      cols.push('role');
      vals.push('superadmin');
      placeholders.push(`$${idx++}`);
    } else if (s.hasIsAdmin) {
      cols.push('is_admin');
      vals.push(true);
      placeholders.push(`$${idx++}`);
    }

    if (s.hasPwdHash) {
      cols.push('password_hash');
      vals.push(hash);
      placeholders.push(`$${idx++}`);
    } else if (s.hasPwd) {
      cols.push('password');
      vals.push(hash);
      placeholders.push(`$${idx++}`);
    }

    if (s.hasCreatedAt) {
      cols.push('created_at');
      vals.push(new Date());
      placeholders.push(`$${idx++}`);
    }
    if (s.hasUpdatedAt) {
      cols.push('updated_at');
      vals.push(new Date());
      placeholders.push(`$${idx++}`);
    }

    const insertSql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES (${placeholders.join(', ')})
      ON CONFLICT (email) DO UPDATE SET
        ${s.hasRole ? "role='superadmin'," : ''}
        ${s.hasPwdHash ? 'password_hash=EXCLUDED.password_hash,' : s.hasPwd ? 'password=EXCLUDED.password,' : ''}
        ${s.hasUpdatedAt ? 'updated_at=NOW(),' : ''}
        email=EXCLUDED.email
      RETURNING id, email ${s.hasRole ? ', role' : ''}
    `;
    const ins = await pool.query(insertSql, vals);
    console.log('[auth][seed] Elevated user ensured:', ins.rows[0]?.email);
  } catch (e) {
    console.error('[auth][seed] error ensuring elevated user', e);
  }
}
