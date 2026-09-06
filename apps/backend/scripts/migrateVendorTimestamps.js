import fs from 'node:fs/promises';
import pool from '../config/db.js';

try {
  await pool.query(await fs.readFile(new URL('../db/vendorTimestamps.sql', import.meta.url), 'utf8'));
  console.log('Vendor updated_at migration applied');
} finally { await pool.end(); }
