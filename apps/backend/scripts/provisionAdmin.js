import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || '');

if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('ADMIN_EMAIL must be a valid email address');
if (password.length < 8) throw new Error('ADMIN_PASSWORD must contain at least 8 characters');

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO sokoeats_users
      (name, email, role, password_hash, status, auth_provider, city, email_verified, phone_verified, marketing_opt_in, terms_accepted_at, profile)
     VALUES ('Platform Administrator', $1, 'admin', $2, 'active', 'password', 'Nairobi', true, false, false, NOW(), $3::jsonb)
     ON CONFLICT (email) DO UPDATE SET
       role = 'admin', password_hash = EXCLUDED.password_hash, status = 'active', auth_provider = 'password',
       email_verified = true, deleted_at = NULL, profile = sokoeats_users.profile || EXCLUDED.profile
     RETURNING id, email, role, status`,
    [email, passwordHash, JSON.stringify({ department: 'Platform Administration', provisioned: true })],
  );
  console.info('[SokoEats][Admin] provisioned', rows[0]);
} finally {
  await pool.end();
}
