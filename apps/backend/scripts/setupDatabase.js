import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/db.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const file of ['schema.sql', 'seed.sql']) {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
  await pool.query(sql);
  console.log(`applied ${file}`);
}
await pool.end();
