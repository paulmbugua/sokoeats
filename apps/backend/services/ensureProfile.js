// apps/backend/services/ensureProfile.js
import pool from '../config/db.js';

function normalizeProfileRole(input) {
  const s = String(input || '').trim().toLowerCase();
  if (s === 'learner') return 'student';
  if (s === 'instructor') return 'tutor';
  if (s === 'owner') return 'admin';

  if (s === 'org_learner') return 'student';
  if (s === 'org_instructor') return 'tutor';
  if (s === 'org_admin') return 'admin';
  if (s === 'org_owner') return 'admin';

  if (s === 'student' || s === 'tutor' || s === 'admin') return s;
  return 'student';
}

export async function ensureProfileIdForUser(userId, opts = {}) {
  if (!userId) return null;

  const role = normalizeProfileRole(opts.role);

  const found = await pool.query('select id from profiles where user_id = $1', [userId]);
  if (found.rows[0]?.id) return found.rows[0].id;

  const u = await pool.query('select name, email from users where id = $1', [userId]);
  const name =
    opts.name ||
    u.rows[0]?.name ||
    (u.rows[0]?.email ? u.rows[0].email.split('@')[0] : 'User');

  // ✅ omit status: let DB default satisfy profiles_status_check
 const ins = await pool.query(
  `
  insert into profiles (user_id, role, name, status)
  values ($1, $2, $3, 'active')
  on conflict (user_id) do update set updated_at = now()
  returning id
  `,
  [userId, role, name],
);

  return ins.rows[0]?.id ?? null;
}
