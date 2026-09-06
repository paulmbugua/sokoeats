import bcrypt from 'bcryptjs';
import pool from '../config/db.js';

const email = String(process.env.SUPPORT_EMAIL || '').trim().toLowerCase();
const password = String(process.env.SUPPORT_PASSWORD || '');

if (!email || !/^\S+@\S+\.\S+$/.test(email)) throw new Error('SUPPORT_EMAIL must be a valid email address');
if (password.length < 12) throw new Error('SUPPORT_PASSWORD must contain at least 12 characters');

try {
  const passwordHash = await bcrypt.hash(password, 12);
  const { rows } = await pool.query(
    `INSERT INTO sokoeats_users
      (name,email,role,password_hash,status,auth_provider,city,email_verified,phone_verified,marketing_opt_in,terms_accepted_at,profile)
     VALUES ('Customer Care', $1, 'support', $2, 'active', 'password', 'Nairobi', true, false, false, NOW(), $3::jsonb)
     ON CONFLICT (email) DO UPDATE SET
       role='support',password_hash=EXCLUDED.password_hash,status='active',auth_provider='password',
       email_verified=true,deleted_at=NULL,profile=sokoeats_users.profile || EXCLUDED.profile
     RETURNING id,email,role,status`,
    [email, passwordHash, JSON.stringify({ department: 'Customer Care', provisioned: true, mustChangePassword: true })],
  );
  await pool.query('UPDATE sokoeats_auth_sessions SET revoked_at=NOW() WHERE user_id=$1 AND revoked_at IS NULL', [rows[0].id]);
  console.info('[SokoEats][Support] provisioned', rows[0]);
} finally {
  await pool.end();
}
