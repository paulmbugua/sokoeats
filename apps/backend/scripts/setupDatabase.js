import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationLockId = 8_026_011_924;
const files = ['schema.sql', 'vendorTimestamps.sql', 'pricing.sql', 'accountDeletion.sql', 'deliveryTracking.sql', 'vendorOperations.sql', 'termsAcceptance.sql', 'customerCare.sql', 'notifications.sql', 'deliveryPartners.sql'];
const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [migrationLockId]);
  // Production setup never inserts demo users, shops, products, orders, or balances.
  for (const file of files) {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw Object.assign(error, { message: `${file}: ${error.message}` });
    }
  }
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [migrationLockId]).catch(() => {});
  client.release();
  await pool.end();
}
