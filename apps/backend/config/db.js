import 'dotenv/config';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (connectionString == null || connectionString === '') {
  throw new Error('DATABASE_URL is required. Example: postgres://postgres:[password]@localhost:5432/sokoeats');
}

const pool = new Pool({ connectionString, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false });
pool.on('error', (err) => console.warn('[pg]', err.message));
export default pool;
