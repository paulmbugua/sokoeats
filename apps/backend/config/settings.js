// apps/backend/config/settings.js
import pool from './db.js';

const cache = new Map();

export async function getSetting(
  key,
  fallback = process.env[key.toUpperCase()] ?? null,
) {
  if (cache.has(key)) return cache.get(key);
  try {
    const { rows } = await pool.query(
      'SELECT value FROM app_settings WHERE key = $1',
      [key],
    );
    const val = rows[0]?.value ?? fallback;
    cache.set(key, val);
    return val;
  } catch {
    return fallback;
  }
}
