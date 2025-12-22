// apps/backend/services/mpesaC2BService.js
import fetch from 'node-fetch';
import {
  getAccessToken,
  getMpesaConfig,
  MPESA_ENV,
  shortcode as defaultShortcode,
} from '../utils/mpesa.js';

function pickEnv(env, liveName, sandboxName) {
  const isSandbox = String(env || '').toLowerCase() === 'sandbox';

  // Prefer env-specific var, fall back to live var (helps during migration)
  const raw =
    (isSandbox ? process.env[sandboxName] : process.env[liveName]) ??
    process.env[liveName] ??
    process.env[sandboxName];

  const v = String(raw || '').trim();
  if (!v) throw new Error(`Missing env: ${isSandbox ? sandboxName : liveName}`);
  return v;
}

export async function registerC2BUrls({
  shortCode,
  responseType = 'Completed',
  env = MPESA_ENV,
} = {}) {
  const validationUrl = pickEnv(
    env,
    'MPESA_C2B_VALIDATION_URL',
    'MPESA_SANDBOX_C2B_VALIDATION_URL',
  );

  const confirmationUrl = pickEnv(
    env,
    'MPESA_C2B_CONFIRMATION_URL',
    'MPESA_SANDBOX_C2B_CONFIRMATION_URL',
  );

  // Optional: allow sandbox-specific shortcode override
  const effectiveShortcode =
    String(shortCode || '').trim() ||
    pickEnv(env, 'MPESA_SHORTCODE', 'MPESA_SANDBOX_SHORTCODE') ||
    defaultShortcode;

  const token = await getAccessToken(env);
  const { base } = getMpesaConfig(env);

  const payload = {
    ShortCode: String(effectiveShortcode),
    ResponseType: responseType, // "Completed" or "Cancelled"
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl,
  };

  const url = `${base}/mpesa/c2b/v1/registerurl`;

  const r = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`RegisterURL failed: ${JSON.stringify(j)}`);

  return j;
}
