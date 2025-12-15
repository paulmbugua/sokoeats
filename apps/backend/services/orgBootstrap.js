// apps/backend/services/orgBootstrap.js
import pool from '../config/db.js';

const slugify = (s) =>
  (String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)) || `org-${Math.random().toString(36).slice(2, 8)}`;

async function uniqueSlug(base, client) {
  const head = slugify(base);
  for (let i = 1; i <= 40; i++) {
    const suffix = i === 1 ? '' : `-${i}`;
    const candidate = (head + suffix).slice(0, 64);
    const { rows } = await (client ?? pool).query(
      'SELECT 1 FROM organizations WHERE slug=$1',
      [candidate]
    );
    if (!rows.length) return candidate;
  }
  return (head.slice(0, 54) + '-' + Date.now().toString(36)).slice(0, 64);
}

export async function ensureOrgForUser(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock on user to serialize bootstraps
    await client.query(
      `SELECT pg_advisory_xact_lock(
         ('x'||substr(md5($1::text),1,8))::bit(32)::int
       )`,
      [String(userId)]
    );

    // 🔍 Look for any org this user owns OR is a member of
    const found = await client.query(
      `
      SELECT o.*
        FROM organizations o
        LEFT JOIN org_memberships m
               ON m.org_id = o.id
              AND m.user_id = $1
       WHERE o.owner_user_id = $1
          OR m.user_id = $1
       ORDER BY
         CASE WHEN m.role IN ('owner','admin') THEN 0 ELSE 1 END,
         o.created_at DESC
       LIMIT 1
      `,
      [userId]
    );

    let orgRow;

    if (found.rowCount) {
      orgRow = found.rows[0];
    } else {
      // No org found at all → create one
      const ures = await client.query(
        'SELECT name, email FROM users WHERE id=$1',
        [userId]
      );
      if (!ures.rowCount) throw new Error('User not found');
      const { name, email } = ures.rows[0];

      const toTitle = (s = '') =>
        s
          .split(/[\s\-_]+/)
          .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
          .join(' ')
          .trim();

      const domain = (email || '').split('@')[1]?.split('.')[0] || '';
      const looksLikeEmail = (name || '').includes('@');
      const base =
        !looksLikeEmail && name?.trim()
          ? name.trim()
          : domain
          ? `${toTitle(domain)} Institute`
          : 'New Organization';
      const orgName = base.slice(0, 80);

      const slug = await uniqueSlug(orgName, client);

      // ⚠️ handle conflict on owner_user_id, not just slug
      const orgIns = await client.query(
        `
        INSERT INTO organizations (owner_user_id, name, slug, created_at, updated_at)
        VALUES ($1,$2,$3,NOW(),NOW())
        ON CONFLICT (owner_user_id) DO UPDATE
          SET name = EXCLUDED.name
        RETURNING *
        `,
        [userId, orgName, slug]
      );

      orgRow = orgIns.rows[0];
    }

    // Ensure owner membership exists
    await client.query(
      `
      INSERT INTO org_memberships (org_id, user_id, role, invited_by, invited_at, joined_at)
      VALUES ($1,$2,'owner',$2,NOW(),NOW())
      ON CONFLICT (org_id, user_id) DO NOTHING
      `,
      [orgRow.id, userId]
    );

    // Ensure subscription exists
    await client.query(
  `
  INSERT INTO org_subscriptions (org_id, tier, seats, active, created_at)
  VALUES ($1,'starter',50,TRUE,NOW())
  ON CONFLICT (org_id) WHERE active = TRUE DO NOTHING
  `,
  [orgRow.id]
);


    await client.query('COMMIT');
    return orgRow;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}
