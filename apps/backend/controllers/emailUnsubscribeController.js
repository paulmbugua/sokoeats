import crypto from 'crypto';
import pool from '../config/db.js';

function unsubscribeToken(email) {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.JWT_SECRET || 'ekazi';
  return crypto.createHmac('sha256', secret).update(String(email).toLowerCase()).digest('hex');
}

function validToken(email, token) {
  if (!email || !token) return false;
  const expected = unsubscribeToken(email);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(token));
  return (
    expectedBuffer.length === actualBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, actualBuffer)
  );
}

async function persist(email, source) {
  try {
    await pool.query(
      `INSERT INTO email_unsubscribes (email, source, created_at, updated_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (email)
       DO UPDATE SET source = EXCLUDED.source, updated_at = NOW()`,
      [String(email).toLowerCase(), source],
    );
  } catch (error) {
    if (!['42P01', '42703'].includes(error?.code)) throw error;
  }
}

export async function unsubscribeOneClick(req, res) {
  const email = req.query.e || req.query.email;
  const token = req.query.t || req.query.token;
  if (!validToken(email, token)) return res.status(400).send('Invalid unsubscribe link');
  await persist(email, 'one-click');
  return res.status(200).send('Unsubscribed');
}

export async function unsubscribeViaLink(req, res) {
  const email = req.query.e || req.query.email;
  const token = req.query.t || req.query.token;
  if (!validToken(email, token)) return res.status(400).send('Invalid unsubscribe link');
  await persist(email, 'link');
  return res.status(200).send('You have been unsubscribed.');
}

export async function unsubscribeManual(req, res) {
  const email = req.body?.email;
  if (!email) return res.status(400).json({ message: 'email is required' });
  await persist(email, 'manual');
  return res.json({ success: true, message: 'Unsubscribed' });
}
