// apps/backend/utils/mpesa.js
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

export const MPESA_ENV = (process.env.MPESA_ENV || 'live').trim().toLowerCase();

function pickEnvVar(liveName, sandboxName, env = MPESA_ENV) {
  const isSandbox = String(env).toLowerCase() === 'sandbox';
  const primary = isSandbox ? process.env[sandboxName] : process.env[liveName];
  const fallback = process.env[liveName]; // fallback to live value if sandbox value missing
  return (primary || fallback || '').trim();
}

export function getMpesaConfig(env = MPESA_ENV) {
  const isSandbox = String(env).toLowerCase() === 'sandbox';

  const base =
    pickEnvVar('MPESA_BASE', 'MPESA_SANDBOX_BASE', env) ||
    (isSandbox ? 'https://sandbox.safaricom.co.ke' : 'https://api.safaricom.co.ke');

  const consumerKey = pickEnvVar('MPESA_CONSUMER_KEY', 'MPESA_SANDBOX_CONSUMER_KEY', env);
  const consumerSecret = pickEnvVar('MPESA_CONSUMER_SECRET', 'MPESA_SANDBOX_CONSUMER_SECRET', env);

  const passkey = pickEnvVar('MPESA_PASSKEY', 'MPESA_SANDBOX_PASSKEY', env);
  const shortcode = pickEnvVar('MPESA_SHORTCODE', 'MPESA_SANDBOX_SHORTCODE', env);
  const b2cShortcode = pickEnvVar('MPESA_B2C_SHORTCODE', 'MPESA_SANDBOX_B2C_SHORTCODE', env);

  const callbackURL = pickEnvVar('CALLBACK_URL', 'MPESA_SANDBOX_CALLBACK_URL', env);
  const timeoutURL = pickEnvVar('TIMEOUT_URL', 'MPESA_SANDBOX_TIMEOUT_URL', env);
  const resultURL = pickEnvVar('RESULT_URL', 'MPESA_SANDBOX_RESULT_URL', env);

  const initiatorName = pickEnvVar('MPESA_INITIATOR_NAME', 'MPESA_SANDBOX_INITIATOR_NAME', env);
  const initiatorPassword = pickEnvVar('MPESA_INITIATOR_PASSWORD', 'MPESA_SANDBOX_INITIATOR_PASSWORD', env);
  const certPath = pickEnvVar('MPESA_CERTIFICATE_PATH', 'MPESA_SANDBOX_CERTIFICATE_PATH', env);

  return {
    env,
    isSandbox,
    base,
    consumerKey,
    consumerSecret,
    passkey,
    shortcode,
    b2cShortcode,
    callbackURL,
    timeoutURL,
    resultURL,
    initiatorName,
    initiatorPassword,
    certPath,
  };
}

/* ─────────────────────────────────────────────────────────
 * Timestamp/password helpers (env-aware)
 * ───────────────────────────────────────────────────────── */
export function mpesaTimestamp() {
  return new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
}

export function mpesaPassword(ts = mpesaTimestamp(), env = MPESA_ENV) {
  const { shortcode, passkey } = getMpesaConfig(env);
  return Buffer.from(`${shortcode}${passkey}${ts}`).toString('base64');
}

/* ─────────────────────────────────────────────────────────
 * SecurityCredential (only needed for initiator APIs like B2C)
 * ───────────────────────────────────────────────────────── */
export function mpesaSecurityCredential(env = MPESA_ENV) {
  const { initiatorPassword, certPath } = getMpesaConfig(env);
  if (!initiatorPassword || !certPath) return null;

  try {
    const pubKey = fs.readFileSync(path.resolve(certPath), 'utf8');
    const encrypted = crypto.publicEncrypt(
      { key: pubKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(initiatorPassword, 'utf8'),
    );
    return encrypted.toString('base64');
  } catch (err) {
    console.error('❌ Failed to generate securityCredential:', err.message);
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
 * Access Token helper (env-aware, supports override)
 * ───────────────────────────────────────────────────────── */
export async function getAccessToken(env = MPESA_ENV) {
  const { base, consumerKey, consumerSecret } = getMpesaConfig(env);

  if (!consumerKey) console.warn(`⚠️ Missing ${env === 'sandbox' ? 'MPESA_SANDBOX_CONSUMER_KEY' : 'MPESA_CONSUMER_KEY'}`);
  if (!consumerSecret) console.warn(`⚠️ Missing ${env === 'sandbox' ? 'MPESA_SANDBOX_CONSUMER_SECRET' : 'MPESA_CONSUMER_SECRET'}`);

  const cred = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  const url = `${base}/oauth/v1/generate?grant_type=client_credentials`;

  try {
    const { data } = await axios.get(url, { headers: { Authorization: `Basic ${cred}` } });
    if (!data?.access_token) throw new Error('No access_token');
    return data.access_token;
  } catch (err) {
    console.error('❌ Error fetching M-Pesa token:', err.response?.data || err.message);
    throw err;
  }
}

/* ─────────────────────────────────────────────────────────
 * Backward compatible exports (current env defaults)
 * ───────────────────────────────────────────────────────── */
const cfg = getMpesaConfig(MPESA_ENV);

export const MPESA_BASE = cfg.base;
export const shortcode = cfg.shortcode;
export const b2cShortcode = cfg.b2cShortcode;
export const callbackURL = cfg.callbackURL;
export const timeoutURL = cfg.timeoutURL;
export const resultURL = cfg.resultURL;
export const initiatorName = cfg.initiatorName;

// legacy (if anyone still imports)
export const timestamp = mpesaTimestamp();
export const password = mpesaPassword(timestamp, MPESA_ENV);
export const securityCredential = mpesaSecurityCredential(MPESA_ENV);
