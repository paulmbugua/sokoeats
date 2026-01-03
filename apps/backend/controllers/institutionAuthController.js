// apps/backend/controllers/institutionAuthController.js
import { OAuth2Client } from 'google-auth-library';
import validator from 'validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/db.js';
import { sendOTP } from '../config/emailService.js';
import { ensureOrgForUser } from '../services/orgBootstrap.js';
import { admin } from '../bootstrap/firebaseAdmin.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID_WEB);
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });

/** Email/password login (no role logic) */
export const institutionLogin = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email?.trim() || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [
      email.trim(),
    ]);
    if (!rows.length) {
      return res
        .status(401)
        .json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    if (!user.password) {
      return res.status(400).json({
        success: false,
        message: 'Use Google sign-in for this account',
      });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid credentials' });
    }

    // Ensure the user has an org and owner/admin membership (idempotent)
    if (process.env.SKIP_ORG_BOOTSTRAP !== '1') {
      try {
        await ensureOrgForUser(user.id);
      } catch (e) {
        console.warn('[institutionLogin] ensureOrgForUser', e?.message);
      }
    }

    const token = signToken(user.id);

    // 🔐 NEW: tell frontend if this account must change password
    const mustChangePassword = !!user.must_change_password;

    return res.json({
      success: true,
      token,
      message: 'Login successful',
      mustChangePassword,
      must_change_password: mustChangePassword,
    });
  } catch (e) {
    console.error('[institutionLogin]', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** Registration (no role asked; silently defaults to 'tutor' to avoid student profile flow) */
export const institutionRegister = async (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email?.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email and password are required',
      });
    }
    if (!validator.isEmail(email.trim())) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid email format' });
    }
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters',
      });
    }

    const exists = await pool.query('SELECT 1 FROM users WHERE email=$1', [
      email.trim(),
    ]);
    if (exists.rows.length) {
      return res
        .status(409)
        .json({ success: false, message: 'User already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const uins = await pool.query(
      'INSERT INTO users (name, email, password, role) VALUES ($1,$2,$3,$4) RETURNING id, name, email, must_change_password',
      [name.trim().slice(0, 80), email.trim(), hashed, 'admin'],
    );
    const userId = uins.rows[0].id;

    // ✅ Single source of truth for org + membership
    try {
      await ensureOrgForUser(userId);
    } catch (bootErr) {
      console.warn(
        '[institutionRegister] ensureOrgForUser failed (non-fatal):',
        bootErr?.message,
      );
    }

    const token = signToken(userId);
    const mustChangePassword = !!uins.rows[0].must_change_password;
    return res.status(201).json({
      success: true,
      token,
      message: 'Sign up successful',
      mustChangePassword,
      must_change_password: mustChangePassword,
    });
  } catch (e) {
    console.error('[institutionRegister]', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

/** Google sign-in (no role gating) */
export const institutionGoogleLogin = async (req, res) => {
  try {
    const rawToken = req.body.token || req.body.idToken;
    const preferredName = (req.body.name || '').toString().trim().slice(0, 80);
    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(400).json({ success: false, message: 'Token missing' });
    }

    // Soft-decode payload to choose verification path
    const decodePayload = (t) => {
      const parts = String(t).split('.');
      if (parts.length !== 3) return null;
      const b64 = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
      try {
        return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      } catch {
        return null;
      }
    };
    const payload = decodePayload(rawToken);
    if (!payload)
      return res
        .status(400)
        .json({ success: false, message: 'Malformed token' });

    const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'mytutorapp-d3c91';
    const allowedAudiences = [
      process.env.GOOGLE_CLIENT_ID_WEB,
      process.env.GOOGLE_CLIENT_ID_ANDROID,
      process.env.GOOGLE_CLIENT_ID_IOS,
    ].filter(Boolean);

    let email, googleId, displayName;

    // Firebase ID token path
    if (
      typeof payload.iss === 'string' &&
      payload.iss.startsWith('https://securetoken.google.com/')
    ) {
      if (payload.aud !== PROJECT_ID) {
        return res
          .status(401)
          .json({ success: false, message: 'Token audience mismatch' });
      }
      const decoded = await admin.auth().verifyIdToken(rawToken);
      email = decoded.email;
      googleId = decoded.uid;
      displayName = preferredName || decoded.name || email || '';
    }
    // Google ID token path
    else if (
      payload.iss === 'https://accounts.google.com' ||
      payload.iss === 'accounts.google.com'
    ) {
      const ticket = await googleClient.verifyIdToken({
        idToken: rawToken,
        audience: allowedAudiences.length ? allowedAudiences : undefined,
      });
      const g = ticket.getPayload();
      if (!g)
        return res
          .status(401)
          .json({ success: false, message: 'Invalid Google token' });
      if (
        g.aud &&
        allowedAudiences.length &&
        !allowedAudiences.includes(g.aud)
      ) {
        return res
          .status(401)
          .json({ success: false, message: 'Google audience mismatch' });
      }
      if (g.email_verified === false) {
        return res
          .status(401)
          .json({ success: false, message: 'Email not verified' });
      }
      email = g.email;
      googleId = g.sub;
      displayName = preferredName || g.name || email || '';
    } else {
      return res
        .status(400)
        .json({ success: false, message: 'Unsupported token issuer' });
    }

    if (!email || !googleId) {
      return res
        .status(400)
        .json({ success: false, message: 'Invalid token claims' });
    }

    // Upsert user; default role to 'admin' for new accounts and upgrade if null/non-admin (but never downgrade superadmin)
    const { rows } = await pool.query(
      `
  INSERT INTO users (name, email, google_id, role)
  VALUES ($1, $2, $3, 'admin')
  ON CONFLICT (email) DO UPDATE
  SET name      = CASE WHEN COALESCE(users.name,'')='' THEN EXCLUDED.name ELSE users.name END,
      google_id = COALESCE(users.google_id, EXCLUDED.google_id)
      -- ❌ no role change on conflict
  RETURNING id, email, name, role, must_change_password
  `,
      [displayName || email, email, googleId],
    );

    const user = rows[0];

    // Ensure the user has an org and is at least an owner (idempotent)
    if (process.env.SKIP_ORG_BOOTSTRAP !== '1') {
      try {
        await ensureOrgForUser(user.id);
      } catch (e) {
        console.warn(
          '[institutionGoogleLogin] ensureOrgForUser failed (non-fatal):',
          e?.message,
        );
      }
    }

    const token = signToken(user.id);
    const mustChangePassword = !!user.must_change_password;
    return res.status(200).json({
      success: true,
      token,
      userId: user.id,
      name: user.name || '',
      mustChangePassword,
      must_change_password: mustChangePassword,
    });
  } catch (e) {
    console.error('[institutionGoogleLogin]', e);
    return res
      .status(500)
      .json({ success: false, message: 'Google authentication failed' });
  }
};

/** Request OTP for password reset (shared semantics) */
export const institutionRequestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body || {};
    const raw = email?.toString().trim();
    if (!raw) {
      return res
        .status(400)
        .json({ success: false, message: 'Email is required' });
    }

    const emailLower = raw.toLowerCase();

    // Look up user (case-insensitive), but keep canonical casing for email when sending
    const { rows } = await pool.query(
      'SELECT id, email FROM users WHERE lower(email) = $1 LIMIT 1',
      [emailLower],
    );
    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    const otp = crypto.randomInt(100000, 999999).toString();

    // Store OTP + expiry in the users table
    await pool.query(
      `
        UPDATE users
           SET reset_otp = $1,
               reset_otp_expires_at = NOW() + INTERVAL '10 minutes'
         WHERE id = $2
      `,
      [otp, user.id],
    );

    // Send email to the canonical address from DB
    await sendOTP(user.email, otp);

    return res.json({
      success: true,
      message: 'OTP sent',
    });
  } catch (e) {
    console.error('[institutionRequestPasswordReset]', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const institutionVerifyOTPAndResetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    const rawEmail = email?.toString().trim();
    if (!rawEmail || !otp || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: 'All fields required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }

    const emailLower = rawEmail.toLowerCase();

    const { rows } = await pool.query(
      `
        SELECT id, reset_otp, reset_otp_expires_at
          FROM users
         WHERE lower(email) = $1
         LIMIT 1
      `,
      [emailLower],
    );

    if (!rows.length) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const u = rows[0];

    // Validate OTP and expiry
    if (!u.reset_otp || u.reset_otp !== otp) {
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    if (
      !u.reset_otp_expires_at ||
      new Date(u.reset_otp_expires_at) < new Date()
    ) {
      return res.status(400).json({ success: false, message: 'Expired OTP' });
    }

    // Hash new password
    const hash = await bcrypt.hash(newPassword.trim(), 10);

    // Update password + clear OTP + clear must_change_password
    await pool.query(
      `
        UPDATE users
           SET password              = $1,
               reset_otp             = NULL,
               reset_otp_expires_at  = NULL,
               must_change_password  = FALSE
         WHERE id = $2
      `,
      [hash, u.id],
    );

    return res.json({
      success: true,
      message: 'Password updated',
    });
  } catch (e) {
    console.error('[institutionVerifyOTPAndResetPassword]', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

export const institutionChangePassword = async (req, res) => {
  try {
    const userId = req.user?.id; // comes from your auth middleware (authOrg/authUser)
    const { currentPassword, newPassword } = req.body || {};

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current and new password are required',
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }

    // Load user
    const { rows } = await pool.query(
      'SELECT id, password FROM users WHERE id=$1 LIMIT 1',
      [userId],
    );
    if (!rows.length || !rows[0].password) {
      return res
        .status(404)
        .json({ success: false, message: 'User not found' });
    }

    const user = rows[0];

    // Check current password
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return res
        .status(401)
        .json({ success: false, message: 'Invalid current password' });
    }

    // Hash and update
    const hash = await bcrypt.hash(newPassword.trim(), 10);

    await pool.query(
      `
      UPDATE users
         SET password = $1,
             must_change_password = FALSE   -- ✅ clear the flag
       WHERE id = $2
      `,
      [hash, userId],
    );

    return res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    console.error('[institutionChangePassword]', e);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};
