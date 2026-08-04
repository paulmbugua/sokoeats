import pool from '../config/db.js';

export async function getScreenPayload(screenKey) {
  const { rows } = await pool.query('SELECT payload FROM sokoeats_screen_payloads WHERE screen_key = $1', [screenKey]);
  if (!rows.length) {
    const err = new Error(`Sokoeats screen payload not found: ${screenKey}`);
    err.status = 404;
    throw err;
  }
  return rows[0].payload;
}

export async function saveScreenPayload(screenKey, payload) {
  const { rows } = await pool.query(
    `INSERT INTO sokoeats_screen_payloads (screen_key, payload, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (screen_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
     RETURNING payload`,
    [screenKey, JSON.stringify(payload)]
  );
  return rows[0].payload;
}
