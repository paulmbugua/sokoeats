import 'dotenv/config';
import { Pool } from 'pg';
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:Ariana2017%2A@localhost:5432/sokoeats';
const pool = new Pool({ connectionString, ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false });
pool.on('error', (err) => console.warn('[pg]', err.message));
export default pool;
