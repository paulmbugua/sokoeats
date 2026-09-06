import fs from 'node:fs/promises';
import pool from '../config/db.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(await fs.readFile(new URL('../db/termsAcceptance.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Applied partner terms acceptance migration (no accounts or sample data created).');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
