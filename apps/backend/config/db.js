import './env.js';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (connectionString == null || connectionString === '') {
  throw new Error('DATABASE_URL is required. Example: postgres://postgres:[password]@localhost:5432/sokoeats');
}

const databaseUrl = new URL(connectionString);
if (['localhost', '127.0.0.1', '[::1]'].includes(databaseUrl.hostname) && databaseUrl.pathname !== '/sokoeats') {
  throw new Error('Local SokoEats DATABASE_URL must target /sokoeats. Check backend .env and shell overrides.');
}
const pool = new Pool({ connectionString, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false });
pool.on('error', (err) => console.warn('[pg]', err.message));
export default pool;
