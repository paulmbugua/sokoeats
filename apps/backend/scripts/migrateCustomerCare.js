import fs from 'node:fs/promises';
import pool from '../config/db.js';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query(await fs.readFile(new URL('../db/customerCare.sql', import.meta.url), 'utf8'));
  await client.query('COMMIT');
  console.log('Application references and customer-care tables are ready.');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await pool.end(); }
