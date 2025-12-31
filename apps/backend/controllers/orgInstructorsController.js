// apps/backend/controllers/orgInstructorsController.js
import 'dotenv/config';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { parse as parseCsv } from 'csv-parse/sync';

/**
 * Simple random temp password generator
 */
function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Cache for detected password column on users table
 */
let USER_PASSWORD_COLUMN = null;

async function resolveUserPasswordColumn(client) {
  if (USER_PASSWORD_COLUMN) return USER_PASSWORD_COLUMN;

  const res = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name   = 'users'
        and column_name in ('password_hash', 'password', 'password_digest', 'hashed_password')
      limit 1
    `,
  );

  if (!res.rows.length) {
    throw new Error(
      'No suitable password column found on users table. Expected one of: password_hash, password, password_digest, hashed_password',
    );
  }

  USER_PASSWORD_COLUMN = res.rows[0].column_name;

  console.log(
    '[orgInstructors] using users password column:',
    USER_PASSWORD_COLUMN,
  );
  return USER_PASSWORD_COLUMN;
}

/**
 * Cache + resolver for org membership table
 */
let ORG_MEMBERS_TABLE = null;
let ORG_MEMBERS_HAS_ROLE = false;

async function resolveOrgMembersTable(client) {
  if (ORG_MEMBERS_TABLE !== null) {
    return { table: ORG_MEMBERS_TABLE, hasRole: ORG_MEMBERS_HAS_ROLE };
  }

  const candidates = [
    'org_members',
    'organization_members',
    'org_memberships',
    'organization_memberships',
  ];

  for (const name of candidates) {
    const reg = await client.query('select to_regclass($1) as reg', [
      `public.${name}`,
    ]);
    if (reg.rows[0] && reg.rows[0].reg) {
      ORG_MEMBERS_TABLE = name;

      const colRes = await client.query(
        `
          select 1 as ok
          from information_schema.columns
          where table_schema = 'public'
            and table_name   = $1
            and column_name  = 'role'
          limit 1
        `,
        [name],
      );
      ORG_MEMBERS_HAS_ROLE = !!colRes.rows.length;

      console.log(
        '[orgInstructors] using membership table:',
        ORG_MEMBERS_TABLE,
        'hasRole=',
        ORG_MEMBERS_HAS_ROLE,
      );

      return { table: ORG_MEMBERS_TABLE, hasRole: ORG_MEMBERS_HAS_ROLE };
    }
  }

  console.warn(
    '[orgInstructors] no org membership table found; skipping membership attach',
  );
  ORG_MEMBERS_TABLE = null;
  ORG_MEMBERS_HAS_ROLE = false;
  return { table: null, hasRole: false };
}

/**
 * Helper: create (or reuse) a user + attach to org as instructor
 * and upsert org_instructor_profiles row.
 *
 * Expects org_instructor_profiles table with at least:
 *   org_id, user_id, staff_code, subject, updated_at
 */
async function upsertOrgInstructor(client, orgId, row) {
  const { name, email, subject, staffCode } = row;

  if (!name) {
    throw new Error('Instructor name is required');
  }

  const normEmail = email ? String(email).trim().toLowerCase() : null;

  // 1) Create or reuse user
  let user;
  let tempPassword = null;

  if (normEmail) {
    const existing = await client.query(
      'select id, name, email from users where lower(email) = $1 limit 1',
      [normEmail],
    );
    if (existing.rows.length) {
      user = existing.rows[0];
    }
  }

  if (!user) {
    tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const passwordCol = await resolveUserPasswordColumn(client);

    const insertUser = await client.query(
      `
      insert into users (name, email, role, ${passwordCol}, must_change_password)
      values ($1, $2, 'tutor', $3, true)
      returning id, name, email, role
    `,
      [name, normEmail, passwordHash],
    );
    user = insertUser.rows[0];
  }

  // 2) Attach to org as instructor in membership table (if present)
  try {
    const { table, hasRole } = await resolveOrgMembersTable(client);
    if (table) {
      const baseSqlWithRole = `
        insert into ${table} (org_id, user_id, role)
        values ($1, $2, 'instructor')
        on conflict do nothing
      `;
      const baseSqlNoRole = `
        insert into ${table} (org_id, user_id)
        values ($1, $2)
        on conflict do nothing
      `;

      const sql = hasRole ? baseSqlWithRole : baseSqlNoRole;
      await client.query(sql, [orgId, user.id]);
    }
  } catch (err) {
    console.warn(
      '[orgInstructors] membership attach failed but continuing:',
      err?.message || err,
    );
  }

  // 3) Upsert org_instructor_profiles (staff_code, subject)
  await client.query(
    `
      insert into org_instructor_profiles (
        org_id,
        user_id,
        staff_code,
        subject
      )
      values ($1, $2, $3, $4)
      on conflict (org_id, user_id) do update
      set
        staff_code = coalesce(excluded.staff_code, org_instructor_profiles.staff_code),
        subject    = coalesce(excluded.subject,    org_instructor_profiles.subject),
        updated_at = now()
    `,
    [orgId, user.id, staffCode || null, subject || null],
  );

  return {
    user,
    tempPassword,
    staffCode: staffCode || null,
    subject: subject || null,
  };
}

/**
 * POST /api/orgs/:orgId/instructors
 * Body: { name, email?, subject?, staffCode?/staff_code? }
 */
export async function createOrgInstructor(req, res) {
  const { orgId } = req.params;

  const {
    // common fields
    name,
    email,

    // camelCase & snake_case
    subject,
    staffCode,
    staff_code,
  } = req.body || {};

  if (!orgId) {
    return res.status(400).json({ message: 'orgId is required' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Instructor name is required' });
  }

  const effectiveSubject = subject ?? null;
  const effectiveStaffCode = staffCode ?? staff_code ?? null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure org exists
    const org = await client.query(
      'select id from organizations where id = $1 limit 1',
      [orgId],
    );
    if (!org.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Organization not found' });
    }

    const result = await upsertOrgInstructor(client, orgId, {
      name,
      email,
      subject: effectiveSubject,
      staffCode: effectiveStaffCode,
    });

    await client.query('COMMIT');

    return res.json({
      ok: true,
      instructor: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        staff_code: result.staffCode,
        subject: result.subject,
      },
      tempPassword: result.tempPassword,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('[createOrgInstructor] error', err);
    return res.status(500).json({ message: 'Failed to create instructor' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/orgs/:orgId/instructors/csv
 * Form-data: file=<csv>
 *
 * CSV columns (header row), any of:
 *   name,email,staff_code,subject
 *   or variants: Name, staffCode, staffId, department, dept …
 */
export async function bulkCreateOrgInstructorsCsv(req, res) {
  const { orgId } = req.params;

  if (!orgId) {
    return res.status(400).json({ message: 'orgId is required' });
  }
  if (!req.file || !req.file.buffer) {
    return res.status(400).json({ message: 'CSV file is required' });
  }

  const csvText = req.file.buffer.toString('utf8');

  let records;
  try {
    records = parseCsv(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    console.error('[bulkCreateOrgInstructorsCsv] parse error', err);
    return res.status(400).json({ message: 'Invalid CSV format' });
  }

  if (!Array.isArray(records) || !records.length) {
    return res.status(400).json({ message: 'CSV is empty' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const org = await client.query(
      'select id from organizations where id = $1 limit 1',
      [orgId],
    );
    if (!org.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Organization not found' });
    }

    const created = [];
    const errors = [];

    for (let i = 0; i < records.length; i += 1) {
      const row = records[i];

      const name =
        row.name || row.Name || row.full_name || row.FullName || row.fullName;

      if (!name) {
        errors.push({ row: i + 1, error: 'Missing name' });
        continue;
      }

      const email = row.email || row.Email || null;

      const subject =
        row.subject || row.Subject || row.department || row.dept || null;

      const staffCode =
        row.staffCode ||
        row.staff_code ||
        row.staffId ||
        row.staff_id ||
        row.staff_no ||
        null;

      try {
        const result = await upsertOrgInstructor(client, orgId, {
          name,
          email,
          subject,
          staffCode,
        });

        created.push({
          row: i + 1,
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          staff_code: result.staffCode,
          tempPassword: result.tempPassword,
        });
      } catch (err) {
        console.error('[bulkCreateOrgInstructorsCsv] row error', i + 1, err);
        errors.push({
          row: i + 1,
          error: err.message || 'Failed to create instructor',
        });
      }
    }

    await client.query('COMMIT');

    return res.json({
      ok: true,
      createdCount: created.length,
      errorCount: errors.length,
      created,
      errors,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('[bulkCreateOrgInstructorsCsv] error', err);
    return res
      .status(500)
      .json({ message: 'Failed to import instructors CSV' });
  } finally {
    client.release();
  }
}

/**
 * PATCH /api/orgs/:orgId/instructors/:instructorId
 * Body: { name?, email?, staffCode?/staff_code?, subject? }
 *
 * NOTE: instructorId is the USER ID (same as roster "id")
 */
export async function updateOrgInstructor(req, res) {
  const actorId = req.user?.id;
  const { orgId, instructorId } = req.params;

  const targetId = Number(instructorId);
  if (!actorId) return res.status(401).json({ message: 'Unauthorized' });
  if (!orgId) return res.status(400).json({ message: 'orgId is required' });
  if (!Number.isFinite(targetId))
    return res.status(400).json({ message: 'Invalid instructorId' });

  // permission: owner/admin can edit anyone; instructor can edit self
  const actorMem = await pool.query(
    `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2 LIMIT 1`,
    [orgId, actorId],
  );
  if (!actorMem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  const actorRole = String(actorMem.rows[0].role || '').toLowerCase();
  const isSelf = Number(actorId) === targetId;

  if (!['owner', 'admin'].includes(actorRole) && !(actorRole === 'instructor' && isSelf)) {
    return res.status(403).json({ message: 'Forbidden' });
  }

  // target must be a staff member in this org
  const targetMem = await pool.query(
    `SELECT role FROM org_memberships WHERE org_id=$1 AND user_id=$2 LIMIT 1`,
    [orgId, targetId],
  );
  if (!targetMem.rowCount)
    return res.status(404).json({ message: 'Instructor not found' });

  const targetRole = String(targetMem.rows[0].role || '').toLowerCase();
  if (!['owner', 'admin', 'instructor'].includes(targetRole)) {
    return res.status(404).json({ message: 'Instructor not found' });
  }

  const body = req.body || {};
  const nameRaw = body.name;
  const emailRaw = body.email;

  const staffCode = body.staffCode ?? body.staff_code;
  const subject = body.subject;

  const name =
    typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : undefined;

  let email;
  if (typeof emailRaw === 'string') {
    const t = emailRaw.trim().toLowerCase();
    email = t ? t : undefined; // ignore empty string
  }

  // nothing to update → return current snapshot
  const hasUserUpdates = name !== undefined || email !== undefined;
  const hasProfileUpdates = staffCode !== undefined || subject !== undefined;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (hasUserUpdates) {
      const set = [];
      const vals = [];

      if (name !== undefined) {
        vals.push(name);
        set.push(`name = $${vals.length}`);
      }
      if (email !== undefined) {
        vals.push(email);
        set.push(`email = $${vals.length}`);
      }

      // only run update if we actually have set clauses
      if (set.length) {
        vals.push(targetId);
        const up = await client.query(
          `UPDATE users SET ${set.join(', ')} WHERE id = $${vals.length} RETURNING id`,
          vals,
        );
        if (!up.rowCount) {
          await client.query('ROLLBACK');
          return res.status(404).json({ message: 'User not found' });
        }
      }
    }

    if (hasProfileUpdates) {
      await client.query(
        `
        INSERT INTO org_instructor_profiles (org_id, user_id, staff_code, subject)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (org_id, user_id) DO UPDATE
        SET
          staff_code = COALESCE(EXCLUDED.staff_code, org_instructor_profiles.staff_code),
          subject    = COALESCE(EXCLUDED.subject,    org_instructor_profiles.subject),
          updated_at = NOW()
        `,
        [
          orgId,
          targetId,
          staffCode === undefined ? null : staffCode || null,
          subject === undefined ? null : subject || null,
        ],
      );
    }

    await client.query('COMMIT');

    const snap = await pool.query(
      `
      SELECT
        u.id, u.name, u.email,
        ip.staff_code, ip.subject
      FROM users u
      LEFT JOIN org_instructor_profiles ip
        ON ip.org_id = $1 AND ip.user_id = u.id
      WHERE u.id = $2
      LIMIT 1
      `,
      [orgId, targetId],
    );

    const r = snap.rows[0];
    return res.json({
      ok: true,
      instructor: {
        id: r.id,
        name: r.name,
        email: r.email,
        staff_code: r.staff_code ?? null,
        subject: r.subject ?? null,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // common uniqueness error: duplicate email, duplicate staff_code if you have a unique constraint, etc.
    if (err?.code === '23505') {
      return res.status(409).json({ message: 'Duplicate value (already exists).' });
    }
    console.error('[updateOrgInstructor] error', err);
    return res.status(500).json({ message: 'Failed to update instructor' });
  } finally {
    client.release();
  }
}
