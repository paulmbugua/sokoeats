import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Production setup never inserts demo users, shops, products, orders, or balances.
for (const file of ['schema.sql', 'vendorTimestamps.sql', 'pricing.sql', 'accountDeletion.sql', 'deliveryTracking.sql', 'vendorOperations.sql', 'termsAcceptance.sql', 'customerCare.sql']) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
  await pool.query(sql);
  console.log(`applied ${file}`);
}
await pool.end();
