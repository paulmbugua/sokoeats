// apps/backend/controllers/emailUnsubscribeController.js
import crypto from 'node:crypto';
import pool from '../config/db.js';

function normalizeEmail(e) {
  return String(e || '')
    .trim()
    .toLowerCase();
}

function sign(email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me';
  return crypto
    .createHmac('sha256', secret)
    .update(normalizeEmail(email))
    .digest('base64url');
}

function verify(email, token) {
  try {
    return !!email && !!token && sign(email) === token;
  } catch {
    return false;
  }
}

async function recordUnsub(email, reason = null) {
  const em = normalizeEmail(email);
  if (!em) return;

  await pool.query(
    `INSERT INTO email_unsubscribes (email, reason)
     VALUES ($1, $2)
     ON CONFLICT (lower(email)) DO NOTHING`,
    [em, reason],
  );

  // Optional: flip marketing flag if present on users table
  try {
    await pool.query(
      `UPDATE users SET email_marketing_opt_in = FALSE WHERE lower(email) = lower($1)`,
      [em],
    );
  } catch {
    /* ignore if column/table doesn't exist */
  }
}

export async function unsubscribeOneClick(req, res) {
  const { e: email, t: token } = req.query || {};
  if (!verify(email, token)) return res.status(400).send('Bad token');
  await recordUnsub(email, 'one-click');
  return res.status(204).end(); // RFC 8058
}

export async function unsubscribeViaLink(req, res) {
  const { e: email, t: token } = req.query || {};
  if (!verify(email, token)) {
    return res
      .status(400)
      .json({ ok: false, message: 'Invalid or missing token.' });
  }
  await recordUnsub(email, 'link');
  return res.json({ ok: true });
}

export async function unsubscribeManual(req, res) {
  const email = normalizeEmail(req.body?.email);
  if (!email)
    return res.status(400).json({ ok: false, message: 'Email required.' });
  await recordUnsub(email, 'manual');
  return res.json({ ok: true });
}
