// apps/backend/controllers/orgLearnersController.js
import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { parse as parseCsv } from 'csv-parse/sync';
import { requireOrgTier } from '../utils/orgTierGuard.js';

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
 * Minimal Cloudinary helper for learner photos.
 * Accepts a single file (Multer memoryStorage or disk).
 */
async function uploadLearnerPhotoToCloudinary(file, resourceType = 'image') {
  // 1) memoryStorage: use buffer + upload_stream
  if (file.buffer) {
    return new Promise((resolve, reject) => {
      const baseName =
        file.originalname?.replace(/\..+$/, '') || `learner_${Date.now()}`;
      const opts = {
        resource_type: resourceType,
        folder: 'org_learner_photos',
        public_id: `auto/${Date.now()}_${baseName}`,
      };
      const stream = cloudinary.uploader.upload_stream(opts, (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, public_id: result.public_id });
      });
      stream.end(file.buffer);
    });
  }

  // 2) disk-based storage fallback (just in case)
  if (file.path) {
    const baseName = path.basename(file.path, path.extname(file.path));
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: resourceType,
      folder: 'org_learner_photos',
      public_id: `auto/${Date.now()}_${baseName}`,
    });
    return { url: result.secure_url, public_id: result.public_id };
  }

  throw new Error('No file.buffer or file.path provided for learner photo');
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
    '[orgLearners] using users password column:',
    USER_PASSWORD_COLUMN,
  );
  return USER_PASSWORD_COLUMN;
}

/**
 * Cache + resolver for org membership table
 * We try some common names and check if they exist in public schema.
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
      // Table exists
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
        '[orgLearners] using membership table:',
        ORG_MEMBERS_TABLE,
        'hasRole=',
        ORG_MEMBERS_HAS_ROLE,
      );

      return { table: ORG_MEMBERS_TABLE, hasRole: ORG_MEMBERS_HAS_ROLE };
    }
  }

  // If we reach here, no known membership table was found

  console.warn(
    '[orgLearners] no org membership table found; skipping membership attach',
  );
  ORG_MEMBERS_TABLE = null;
  ORG_MEMBERS_HAS_ROLE = false;
  return { table: null, hasRole: false };
}

/**
 * Helper: create (or reuse) a user + attach to org as learner
 * and upsert org_learner_profiles row.
 */
async function upsertOrgLearner(client, orgId, row) {
  const {
    name,
    email,
    classLabel,
    guardianEmail,
    admissionCode,
    houseLabel,
    dormLabel,
    clubLabel,
    photoUrl,
  } = row;

  if (!name) {
    throw new Error('Learner name is required');
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
      values ($1, $2, 'student', $3, true)
      returning id, name, email, role
    `,
      [name, normEmail, passwordHash],
    );
    user = insertUser.rows[0];
  }

  // 2) Attach to org as learner in membership table (if we find one)
  try {
    const { table, hasRole } = await resolveOrgMembersTable(client);
    if (table) {
      const baseSqlWithRole = `
        insert into ${table} (org_id, user_id, role)
        values ($1, $2, 'learner')
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
    // Membership attach failure should NOT block learner creation

    console.warn(
      '[orgLearners] membership attach failed but continuing:',
      err?.message || err,
    );
  }

  // 3) Upsert org_learner_profiles (admission_code, class_label, guardian_email, + extras)
  await client.query(
    `
      insert into org_learner_profiles (
        org_id,
        user_id,
        admission_code,
        class_label,
        guardian_email,
        house_label,
        dorm_label,
        club_label,
        photo_url,
        temp_password
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (org_id, user_id) do update
      set
        admission_code = coalesce(excluded.admission_code, org_learner_profiles.admission_code),
        class_label    = coalesce(excluded.class_label,    org_learner_profiles.class_label),
        guardian_email = coalesce(excluded.guardian_email, org_learner_profiles.guardian_email),
        house_label    = coalesce(excluded.house_label,    org_learner_profiles.house_label),
        dorm_label     = coalesce(excluded.dorm_label,     org_learner_profiles.dorm_label),
        club_label     = coalesce(excluded.club_label,     org_learner_profiles.club_label),
        photo_url      = coalesce(excluded.photo_url,      org_learner_profiles.photo_url),
        temp_password  = coalesce(excluded.temp_password,  org_learner_profiles.temp_password),
        updated_at     = now()
    `,
    [
      orgId,
      user.id,
      admissionCode || null,
      classLabel || null,
      guardianEmail || null,
      houseLabel || null,
      dormLabel || null,
      clubLabel || null,
      photoUrl || null,
      tempPassword || null, // 🟢 only non-null when we created a NEW user
    ],
  );

  return {
    user,
    tempPassword,
    admissionCode: admissionCode || null,
    classLabel: classLabel || null,
    guardianEmail: guardianEmail || null,
    houseLabel: houseLabel || null,
    dormLabel: dormLabel || null,
    clubLabel: clubLabel || null,
    photoUrl: photoUrl || null,
  };
}

/**
 * POST /api/orgs/:orgId/learners
 * Body: { name, email?, classLabel?, guardianEmail?, admissionCode? }
 */
export async function createOrgLearner(req, res) {
  const { orgId } = req.params;

  const {
    // common fields
    name,
    email,

    // camelCase variants
    classLabel,
    guardianEmail,
    admissionCode,
    houseLabel,
    dormLabel,
    clubLabel,
    photoUrl,

    // snake_case variants
    class_label,
    guardian_email,
    admission_code,
    house_label,
    dorm_label,
    club_label,
    photo_url,
  } = req.body || {};

  if (!orgId) {
    return res.status(400).json({ message: 'orgId is required' });
  }
  if (!name) {
    return res.status(400).json({ message: 'Learner name is required' });
  }

  // Prefer camelCase if provided, otherwise fall back to snake_case
  const effectiveClassLabel = classLabel ?? class_label ?? null;
  const effectiveGuardianEmail = guardianEmail ?? guardian_email ?? null;
  const effectiveAdmissionCode = admissionCode ?? admission_code ?? null;
  const effectiveHouseLabel = houseLabel ?? house_label ?? null;
  const effectiveDormLabel = dormLabel ?? dorm_label ?? null;
  const effectiveClubLabel = clubLabel ?? club_label ?? null;
  const effectivePhotoUrl = photoUrl ?? photo_url ?? null;

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

    const result = await upsertOrgLearner(client, orgId, {
      name,
      email,
      classLabel: effectiveClassLabel,
      guardianEmail: effectiveGuardianEmail,
      admissionCode: effectiveAdmissionCode,
      houseLabel: effectiveHouseLabel,
      dormLabel: effectiveDormLabel,
      clubLabel: effectiveClubLabel,
      photoUrl: effectivePhotoUrl,
    });

    await client.query('COMMIT');

    return res.json({
      ok: true,
      learner: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        admission_code: result.admissionCode,
        class_label: result.classLabel,
        guardian_email: result.guardianEmail,
        house_label: result.houseLabel,
        dorm_label: result.dormLabel,
        club_label: result.clubLabel,
        photo_url: result.photoUrl,
      },
      // admin can show this once
      tempPassword: result.tempPassword,
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    console.error('[createOrgLearner] error', err);
    return res.status(500).json({ message: 'Failed to create learner' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/orgs/:orgId/learners/csv
 * Form-data: file=<csv>
 *
 * CSV columns (header row), any of:
 *   name,email,classLabel,guardianEmail,admissionCode
 *   or variants: Name, class, grade, guardian_email, admission_no, adm_no …
 */
export async function bulkCreateOrgLearnersCsv(req, res) {
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
    console.error('[bulkCreateOrgLearnersCsv] parse error', err);
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

      const classLabel =
        row.classLabel || row.class || row.class_name || row.grade || null;

      const guardianEmail =
        row.guardianEmail || row.guardian_email || row.parent_email || null;

      const admissionCode =
        row.admissionCode ||
        row.admission_code ||
        row.admissionNo ||
        row.admission_no ||
        row.adm_no ||
        null;

      const houseLabel =
        row.houseLabel || row.house_label || row.house || row.stream || null;

      const dormLabel =
        row.dormLabel || row.dorm_label || row.dorm || row.hostel || null;

      const clubLabel = row.clubLabel || row.club_label || row.club || null;

      const photoUrl = row.photoUrl || row.photo_url || null;

      try {
        const result = await upsertOrgLearner(client, orgId, {
          name,
          email,
          classLabel,
          guardianEmail,
          admissionCode,
          houseLabel,
          dormLabel,
          clubLabel,
          photoUrl,
        });

        created.push({
          row: i + 1,
          id: result.user.id,
          name: result.user.name,
          email: result.user.email,
          admission_code: result.admissionCode,
          tempPassword: result.tempPassword,
        });
      } catch (err) {
        console.error('[bulkCreateOrgLearnersCsv] row error', i + 1, err);
        errors.push({
          row: i + 1,
          error: err.message || 'Failed to create learner',
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

    console.error('[bulkCreateOrgLearnersCsv] error', err);
    return res.status(500).json({ message: 'Failed to import learners CSV' });
  } finally {
    client.release();
  }
}

/**
 * POST /api/orgs/:orgId/learners/photo-by-admission
 *
 * Two possible modes:
 *  1) JSON body: { admission_code, photo_url }
 *  2) multipart/form-data: admission_code + file=<image>
 *
 * In the web UI you’re already doing Cloudinary upload via uploadAsset
 * and then calling this with { admission_code, photo_url }.
 * The file mode is just a convenience / future-proofing.
 */
export async function setOrgLearnerPhotoByAdmission(req, res) {
  try {
    const { orgId } = req.params;
    const body = req.body || {};

    const admissionCode = body.admission_code || body.admissionCode || null;
    let photoUrl = body.photo_url || body.photoUrl || null;

    if (!orgId) {
      return res.status(400).json({ ok: false, message: 'orgId is required.' });
    }
    if (!admissionCode) {
      return res
        .status(400)
        .json({ ok: false, message: 'admission_code is required.' });
    }

    // Ensure org has an active tier (starter/pro/enterprise)
    await requireOrgTier(orgId, ['starter', 'pro', 'enterprise']);

    // If a file is provided, upload to Cloudinary (image)
    if (req.file) {
      const upload = await uploadLearnerPhotoToCloudinary(req.file, 'image');
      photoUrl = upload.url;
    }

    if (!photoUrl) {
      return res.status(400).json({
        ok: false,
        message: 'photo_url or image file is required.',
      });
    }

    const { rows } = await pool.query(
      `
        update org_learner_profiles
        set photo_url = $3,
            updated_at = now()
        where org_id = $1
          and admission_code = $2
        returning user_id
      `,
      [orgId, admissionCode, photoUrl],
    );

    if (!rows.length) {
      return res.status(404).json({
        ok: false,
        message: `No learner found with admission_code "${admissionCode}" for this organization.`,
      });
    }

    return res.json({
      ok: true,
      user_id: rows[0].user_id,
      photo_url: photoUrl,
    });
  } catch (err) {
    console.error('[setOrgLearnerPhotoByAdmission] error', err);
    return res
      .status(500)
      .json({ ok: false, message: 'Failed to set learner photo.' });
  }
}

// apps/backend/controllers/orgLearnersController.js
export async function saveOrgLearnerAttendance(req, res, next) {
  try {
    console.log('[saveOrgLearnerAttendance] params', req.params);
    console.log('[saveOrgLearnerAttendance] raw body', req.body);

    const { orgId, studentId } = req.params;
    const {
      termId,
      sessionId, // optional (for later)
      lessonsHeld,
      lessonsAttended,
      behaviorRating,
      punctualityRating,
      teacherComment,
    } = req.body || {};

    if (!termId) {
      console.log('[saveOrgLearnerAttendance] 400 – missing termId');
      return res.status(400).json({ ok: false, message: 'termId is required' });
    }

    const studentIdNum = Number(studentId);
    if (!Number.isFinite(studentIdNum)) {
      console.log('[saveOrgLearnerAttendance] 400 – invalid studentId', {
        studentId,
      });
      return res.status(400).json({ ok: false, message: 'Invalid studentId' });
    }

    const lh =
      lessonsHeld == null || lessonsHeld === '' ? null : Number(lessonsHeld);
    const la =
      lessonsAttended == null || lessonsAttended === ''
        ? null
        : Number(lessonsAttended);
    const bh =
      behaviorRating == null || behaviorRating === ''
        ? null
        : Number(behaviorRating);
    const pu =
      punctualityRating == null || punctualityRating === ''
        ? null
        : Number(punctualityRating);

    const attendancePercent =
      lh && la != null && lh > 0 ? (la / lh) * 100 : null;

    console.log('[saveOrgLearnerAttendance] normalized', {
      orgId,
      studentIdNum,
      termId,
      sessionId,
      lh,
      la,
      bh,
      pu,
      attendancePercent,
      teacherComment,
    });

    await pool.query(
      `
      INSERT INTO org_learner_attendance (
        org_id,
        user_id,
        term_id,
        session_id,
        lessons_held,
        lessons_attended,
        attendance_percent,
        behavior_rating,
        punctuality_rating,
        teacher_comment,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid,
        $2::bigint,
        $3::uuid,
        $4::uuid,
        $5::int,
        $6::int,
        $7::numeric,
        $8::int,
        $9::int,
        $10::text,
        NOW(),
        NOW()
      )
      ON CONFLICT (org_id, user_id, term_id)
      DO UPDATE SET
        session_id         = COALESCE(EXCLUDED.session_id, org_learner_attendance.session_id),
        lessons_held       = EXCLUDED.lessons_held,
        lessons_attended   = EXCLUDED.lessons_attended,
        attendance_percent = EXCLUDED.attendance_percent,
        behavior_rating    = EXCLUDED.behavior_rating,
        punctuality_rating = EXCLUDED.punctuality_rating,
        teacher_comment    = EXCLUDED.teacher_comment,
        updated_at         = NOW()
      `,
      [
        orgId,
        studentIdNum,
        termId, // 👈 UUID
        sessionId || null, // optional
        lh,
        la,
        attendancePercent,
        bh,
        pu,
        teacherComment ?? null,
      ],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[saveOrgLearnerAttendance] error', err);
    return next(err);
  }
}
