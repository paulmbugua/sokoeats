import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/* ─────────────────────────────────────────────────────────
 * Environment vars
 * ───────────────────────────────────────────────────────── */
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const passkey = process.env.MPESA_PASSKEY;
const shortcode = process.env.MPESA_SHORTCODE;
const b2cShortcode = process.env.MPESA_B2C_SHORTCODE;
const callbackURL = process.env.CALLBACK_URL; // student STK callback
const timeoutURL = process.env.TIMEOUT_URL; // B2C timeout
const resultURL = process.env.RESULT_URL; // B2C result
const initiatorName = process.env.MPESA_INITIATOR_NAME;
const initiatorPassword = process.env.MPESA_INITIATOR_PASSWORD;
const certPath = process.env.MPESA_CERTIFICATE_PATH;

// New: environment-aware base (sandbox vs live)
const MPESA_ENV = (process.env.MPESA_ENV || 'live').trim().toLowerCase();
const MPESA_BASE =
  MPESA_ENV === 'sandbox'
    ? 'https://sandbox.safaricom.co.ke'
    : 'https://api.safaricom.co.ke';

/* ─────────────────────────────────────────────────────────
 * Validate presence (warn — don’t crash boot)
 * ───────────────────────────────────────────────────────── */
[
  ['MPESA_CONSUMER_KEY', consumerKey],
  ['MPESA_CONSUMER_SECRET', consumerSecret],
  ['MPESA_PASSKEY', passkey],
  ['MPESA_SHORTCODE', shortcode],
  ['CALLBACK_URL', callbackURL],
  ['TIMEOUT_URL', timeoutURL],
  ['RESULT_URL', resultURL],
  ['MPESA_INITIATOR_NAME', initiatorName],
  ['MPESA_INITIATOR_PASSWORD', initiatorPassword],
  ['MPESA_CERTIFICATE_PATH', certPath],
  ['MPESA_ENV', MPESA_ENV],
].forEach(([name, val]) => {
  if (!val) console.warn(`⚠️ ${name} is missing`);
});

/* ─────────────────────────────────────────────────────────
 * Dynamic timestamp/password helpers (per-request safe)
 * ───────────────────────────────────────────────────────── */
export function mpesaTimestamp() {
  // Daraja expects yyyyMMddHHmmss in provider’s timezone; ISO slice is accepted by API
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
}
export function mpesaPassword(ts = mpesaTimestamp()) {
  // BusinessShortCode + Passkey + Timestamp, base64
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
}

/* ─────────────────────────────────────────────────────────
 * Legacy constants (kept for backward compatibility)
 * NOTE: Prefer using mpesaTimestamp/mpesaPassword()
 * ───────────────────────────────────────────────────────── */
const timestamp = mpesaTimestamp();
const password = mpesaPassword(timestamp);

/* ─────────────────────────────────────────────────────────
 * SecurityCredential (encrypt initiatorPassword using Safaricom public cert)
 * ───────────────────────────────────────────────────────── */
let securityCredential = null;
if (initiatorPassword && certPath) {
  try {
    const pubKey = fs.readFileSync(path.resolve(certPath), 'utf8');
    const encrypted = crypto.publicEncrypt(
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(initiatorPassword, 'utf8'),
    );
    securityCredential = encrypted.toString('base64');
  } catch (err) {
    console.error('❌ Failed to generate securityCredential:', err.message);
  }
} else {
  console.warn(
    '❌ Cannot generate securityCredential: missing password or certificate path',
  );
}

/* ─────────────────────────────────────────────────────────
 * Access Token helper (env-aware base URL)
 * ───────────────────────────────────────────────────────── */
export async function getAccessToken() {
  const cred = Buffer.from(`${consumerKey}:${consumerSecret}`).toString(
    'base64',
  );
  try {
    const { data } = await axios.get(
      `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
      { headers: { Authorization: `Basic ${cred}` } },
    );
    if (!data.access_token) throw new Error('No access_token');
    return data.access_token;
  } catch (err) {
    console.error(
      '❌ Error fetching M-Pesa token:',
      err.response?.data || err.message,
    );
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────
 * Exports
 * ───────────────────────────────────────────────────────── */
export {
  shortcode,
  b2cShortcode,
  callbackURL,
  timeoutURL,
  resultURL,
  initiatorName,
  // legacy (prefer dynamic helpers above)
  timestamp,
  password,
  securityCredential,
  // new base + env (for services/controllers)
  MPESA_BASE,
  MPESA_ENV,
};
