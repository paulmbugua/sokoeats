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
