// apps/backend/controllers/certificatesController.js
import Joi from 'joi';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';
import axios from 'axios';
import pool from '../config/db.js'; // PG pool
import { generateCertificatePdfBuffer } from '../services/certificateService.js';
import { getEntitlement, upsertEntitlement, isUuid } from './_entitlements.js';
import { getEntitlementsForUser,upsertAiCertificateEntitlement, } from './_aiCourseEntitlements.js';

// ---------- Validators ----------
const generateSchema = Joi.object({
  courseId: Joi.string().uuid().required(),
});

// ---------- Utils / Helpers ----------
// Require purchase/enrollment for non-OER flow
async function hasPurchasedCourse(studentId, courseId) {
  const q = await pool.query(
    `SELECT 1 FROM course_purchases WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
    [studentId, courseId],
  );
  return q.rowCount > 0;
}

async function hasEnrollment(studentId, courseId) {
  const q = await pool.query(
    `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
    [studentId, courseId],
  );
  return q.rowCount > 0;
}

// Map internal token purchases to a valid payment_method in your CHECK
function resolvePaymentMethod(source) {
  const env = (process.env.PLATFORM_BALANCE_METHOD || '').trim(); // e.g., 'Tokens' or 'Manual'
  if (env) return env;
  const s = String(source || '').toLowerCase();
  if (
    [
      'platformbalance',
      'platform_balance',
      'wallet',
      'tokens',
      'internal',
    ].includes(s)
  )
    return 'Tokens';
  if (s.includes('paypal')) return 'PayPal';
  if (s.includes('mpesa') || s.includes('m-pesa')) return 'M-Pesa';
  if (s.includes('stripe')) return 'Stripe';
  return 'Manual';
}

// Insert into transactions using only columns that exist in this DB
async function insertTransactionDynamic(client, row) {
  const { rows: txColsRows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'transactions'
  `);
  const txCols = new Set(txColsRows.map((r) => r.column_name));

  const cols = [];
  const vals = [];
  const push = (col, val) => {
    cols.push(col);
    vals.push(val);
  };

  // required/common
  push('user_id', row.user_id);
  push('type', row.type);
  push('amount', row.amount);
  push('description', row.description);
  if (txCols.has('date')) push('date', row.date || new Date());
  push('status', row.status || 'Completed');
  if (txCols.has('currency')) push('currency', row.currency || 'USD');
  if (txCols.has('payment_method')) push('payment_method', row.payment_method);
  if (txCols.has('source')) push('source', row.source);

  if (txCols.has('created_at')) push('created_at', new Date());
  if (txCols.has('updated_at')) push('updated_at', new Date());
  if (txCols.has('payer_email')) push('payer_email', row.payer_email ?? null);
  if (txCols.has('payer_id')) push('payer_id', row.payer_id ?? null);

  const placeholders = vals.map((_, i) => `$${i + 1}`).join(', ');
  await client.query(
    `INSERT INTO transactions (${cols.join(', ')}) VALUES (${placeholders})`,
    vals,
  );
}

function logErr(tag, err, extra = {}) {
  const x = (err && err.response && err.response.headers) || {};
  const xCld = x['x-cld-error'] || x['X-Cld-Error'];
  console.error(tag, {
    message: err?.message,
    status: err?.status || err?.response?.status,
    x_cld_error: xCld,
    stack: err?.stack,
    ...extra,
  });
}

// ----- AI user UUID resolution (prevents "1631" -> uuid crash) -----

let _authUuidShapeCache = null;

async function detectAuthUuidShape(client) {
  if (_authUuidShapeCache) return _authUuidShapeCache;

  // users table: look for auth_user_id uuid
  const usersCols = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='users'
       AND column_name IN ('auth_user_id','user_uuid','user_id')
  `);

  // profiles table: look for auth uuid columns + user_id numeric
  const profCols = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='profiles'
       AND column_name IN ('auth_user_id','user_uuid','user_id')
  `);

  const uMap = new Map(usersCols.rows.map((r) => [r.column_name, r.data_type]));
  const pMap = new Map(profCols.rows.map((r) => [r.column_name, r.data_type]));

  const usersAuthUuidCol =
    ['auth_user_id', 'user_uuid', 'user_id'].find((c) => uMap.get(c) === 'uuid') || null;

  const profilesAuthUuidCol =
    ['auth_user_id', 'user_uuid', 'user_id'].find((c) => pMap.get(c) === 'uuid') || null;

  const profilesUserIdIsNumeric =
    pMap.get('user_id') === 'integer' || pMap.get('user_id') === 'bigint';

  _authUuidShapeCache = {
    usersAuthUuidCol,
    profilesAuthUuidCol,
    profilesUserIdIsNumeric,
  };
  return _authUuidShapeCache;
}

function pickAuthUuidFromReqUser(u) {
  const cand = [
    u?.uid,
    u?.sub,
    u?.auth_user_id,
    u?.user_uuid,
    u?.userIdUuid,
    u?.userUUID,
  ];
  for (const v of cand) {
    if (isUuid(v)) return String(v);
  }
  return null;
}

async function resolveAuthUuidForNumericUserId(userIdNum) {
  const n = Number(userIdNum);
  if (!Number.isFinite(n)) return null;

  const shape = await detectAuthUuidShape(pool);

  // 1) users table (best)
  if (shape.usersAuthUuidCol) {
    try {
      const q = await pool.query(
        `SELECT ${shape.usersAuthUuidCol} AS uid FROM users WHERE id = $1 LIMIT 1`,
        [n],
      );
      const uid = q.rows?.[0]?.uid ? String(q.rows[0].uid) : null;
      if (uid && isUuid(uid)) return uid;
    } catch {}
  }

  // 2) profiles table (common in your app)
  if (shape.profilesAuthUuidCol) {
    // Most common: profiles.user_id = users.id (numeric)
    if (shape.profilesUserIdIsNumeric) {
      const q = await pool.query(
        `SELECT ${shape.profilesAuthUuidCol} AS uid
           FROM profiles
          WHERE user_id = $1
          LIMIT 1`,
        [n],
      );
      const uid = q.rows?.[0]?.uid ? String(q.rows[0].uid) : null;
      if (uid && isUuid(uid)) return uid;
    }

    // Fallback: sometimes numeric is profile.id (less likely here, but safe)
    const q2 = await pool.query(
      `SELECT ${shape.profilesAuthUuidCol} AS uid
         FROM profiles
        WHERE id = $1
        LIMIT 1`,
      [n],
    );
    const uid2 = q2.rows?.[0]?.uid ? String(q2.rows[0].uid) : null;
    if (uid2 && isUuid(uid2)) return uid2;
  }

  return null;
}


// add near top with other helpers
async function hasExtendedByIssuance(userId, courseId) {
  const q = await pool.query(
    `
    SELECT 1
      FROM ai_certificate_issuances i
      JOIN ai_certificates c ON c.id = i.certificate_id
     WHERE i.user_id = $1
       AND (i.course_id IS NULL OR i.course_id = $2)
       AND (
          c.tier = 'extended'
       OR c.title ILIKE '%extended%'
       OR c.title ILIKE '%transcript%'
       OR c.code ~* '\\y(ext|extended|xtra|plus)\\y'
       )
     LIMIT 1
  `,
    [userId, courseId],
  );
  return q.rowCount > 0;
}

async function hasOrgCoverForCourse(studentId, courseId) {
  // Prove a submitted, passed org attempt tied to this course
  const q = await pool.query(
    `
      SELECT 1
        FROM org_quiz_attempts q
        JOIN org_course_assignments a ON a.id = q.assignment_id
       WHERE q.user_id = $1
         AND q.submitted_at IS NOT NULL
         AND q.passed = TRUE
         AND a.course_id = $2
       LIMIT 1
    `,
    [studentId, courseId],
  );
  return q.rowCount > 0;
}

function extractPublicIdFromCloudinaryUrl(url) {
  try {
    const u = new URL(url);
    if (!/\.cloudinary\.com$/i.test(u.hostname)) return null;
    const parts = u.pathname.split('/');
    const uploadIdx = parts.findIndex((p) => p === 'upload');
    if (uploadIdx === -1) return null;
    const afterUpload = parts.slice(uploadIdx + 1);
    const vIdx = afterUpload.findIndex((p) => /^v\d+$/i.test(p));
    const afterVersion =
      vIdx !== -1 ? afterUpload.slice(vIdx + 1) : afterUpload;
    const publicIdWithExt = afterVersion.join('/');
    return publicIdWithExt.replace(/\.[a-z0-9]+$/i, '');
  } catch {
    return null;
  }
}
function publicIdFromPublicIdOrUrl(maybe) {
  if (!maybe) return null;
  return maybe.includes('://')
    ? extractPublicIdFromCloudinaryUrl(maybe)
    : maybe;
}

async function hasCourseCompleteAchievement(studentId, courseId) {
  console.time('[cert] hasCourseCompleteAchievement');
  const q = await pool.query(
    `SELECT 1 FROM achievements
     WHERE student_id = $1 AND course_id = $2
     LIMIT 1`,
    [studentId, courseId],
  );
  console.timeEnd('[cert] hasCourseCompleteAchievement');
  return q.rowCount > 0;
}

async function hasCompletedAllWeeks(studentId, courseId) {
  console.time('[cert] hasCompletedAllWeeks:loadCourse');
  const courseRes = await pool.query(
    `SELECT syllabus FROM courses WHERE id = $1`,
    [courseId],
  );
  console.timeEnd('[cert] hasCompletedAllWeeks:loadCourse');
  if (!courseRes.rowCount) return false;

  const syllabus = courseRes.rows[0].syllabus || [];
  if (!Array.isArray(syllabus) || syllabus.length === 0) return false;

  const weeks = syllabus.map((w) => w.week).filter((w) => w != null);

  console.time('[cert] hasCompletedAllWeeks:progress');
  const progRes = await pool.query(
    `SELECT week, status FROM course_progress
     WHERE student_id = $1 AND course_id = $2`,
    [studentId, courseId],
  );
  console.timeEnd('[cert] hasCompletedAllWeeks:progress');

  const completedAll = weeks.every((w) =>
    progRes.rows.some((r) => r.week === w && r.status === 'Completed'),
  );

  return completedAll;
}

async function isEligibleForCertificate(studentId, courseId) {
  console.group('[cert] isEligibleForCertificate');
  const a = await hasCourseCompleteAchievement(studentId, courseId);
  console.log('[cert] hasCourseCompleteAchievement ->', a);
  const b = await hasCompletedAllWeeks(studentId, courseId);
  console.log('[cert] hasCompletedAllWeeks ->', b);
  let c = false;
  try {
    c = await hasOrgCoverForCourse(studentId, courseId);
  } catch {}
  console.log('[cert] hasOrgPassedAssignment ->', c);
  console.groupEnd();
  // Eligible if ANY of these are true (achievement OR completed weeks OR org pass)
  return a || b || c;
}

// Build a crawler-friendly OG image URL (no client Cloudinary logic).
function buildOgRedirectUrl({
  cloudName,
  certificateId,
  brandPublicId,
  student,
  course,
}) {
  const safeBrand = (brandPublicId || 'branding/logo').replace(/\//g, ':');
  const transforms = [
    'pg_1',
    'w_1200,h_630,c_fill',
    `l_${safeBrand},w_180,g_north_west,x_40,y_40`,
  ];

  if (student) {
    const s = encodeURIComponent(student);
    transforms.push(
      `l_text:Arial_48_bold:${s},g_south_west,x_40,y_120,co_rgb:0D141C`,
    );
  }
  if (course) {
    const c = encodeURIComponent(course);
    transforms.push(
      `l_text:Arial_36:${c},g_south_west,x_40,y_60,co_rgb:49739C`,
    );
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transforms.join('/')}/certificates:${certificateId}.pdf.jpg`;
}

// Parse Cloudinary public_id from a secure URL, else null
function publicIdFromCloudinaryUrl(u) {
  try {
    if (!u) return null;
    const url = new URL(u);
    // Expect: /image/upload/<optional transforms>/<publicId>.<ext>
    const parts = url.pathname.split('/');
    const uploadIdx = parts.findIndex((p) => p === 'upload');
    if (uploadIdx === -1) return null;
    const tail = parts.slice(uploadIdx + 1).join('/'); // "<transforms>/<publicId>.<ext>" OR "<publicId>.<ext>"
    const last = tail.split('/').pop(); // "<publicId>.<ext>"
    if (!last) return null;
    const publicId = tail
      .replace(/^(.*\/)?/, '')
      .replace(/\.[a-zA-Z0-9]+$/, ''); // drop transforms + extension
    // If transforms existed, the above loses folders. Safer path:
    const afterUpload = parts.slice(uploadIdx + 1);
    // drop any transformation segments until we hit something with a dot or known folder:
    // We'll rebuild by stripping the final extension only.
    const joined = afterUpload.join('/');
    return joined
      .replace(/^.*?\/(?=[^/]+\.[a-zA-Z0-9]+$)/, '')
      .replace(/\.[a-zA-Z0-9]+$/, '');
  } catch {
    return null;
  }
}

// Get the most recent org (name, logo_url, signature_url, certificate_title) that covered this user/course
async function getOrgBrandForCourse(studentId, courseId) {
  console.time('[cert] getOrgBrandForCourse');
  const q = await pool.query(
    `
      SELECT o.name,
             o.logo_url,
             o.signature_url,
             o.instructor_signature_url,
             COALESCE(o.certificate_title, 'Certificate of Completion') AS certificate_title
        FROM org_quiz_attempts q
        JOIN org_course_assignments a ON a.id = q.assignment_id
        JOIN organizations o         ON o.id = COALESCE(a.org_id, q.org_id)
       WHERE q.user_id     = $1
         AND a.course_id   = $2
         AND q.submitted_at IS NOT NULL
         AND q.passed      = TRUE
       ORDER BY q.submitted_at DESC
       LIMIT 1
    `,
    [studentId, courseId],
  );
  console.timeEnd('[cert] getOrgBrandForCourse');

  if (!q.rowCount) {
    console.warn('[cert] getOrgBrandForCourse -> no org brand row found');
    return null;
  }
  const row = q.rows[0];
  console.log('[cert] getOrgBrandForCourse -> org match', {
    name: row.name,
    hasLogo: !!row.logo_url,
    hasSig: !!row.signature_url,
    hasInstructorSig: !!row.instructor_signature_url,
    title: row.certificate_title,
  });
  return row;
}

// ---------- Controllers ----------
export async function checkEligibility(req, res) {
  try {
    const studentId = req.user.id;
    const { courseId } = req.params;
    if (!isUuid(courseId)) {
      return res.status(400).json({ error: 'Invalid courseId' });
    }
    // ⬇️ prevent 304 caching issues
    res.setHeader('Cache-Control', 'no-store');

    console.log('[cert] checkEligibility', { studentId, courseId });
    const a = await hasCourseCompleteAchievement(studentId, courseId);
    const b = await hasCompletedAllWeeks(studentId, courseId);
    let c = false;
    try {
      c = await hasOrgCoverForCourse(studentId, courseId);
    } catch (_) {}

    const eligible = a || b || c;

    let reason = null;
    if (!eligible) {
      const missing = [];
      if (!a) missing.push('earn the course completion achievement');
      if (!b) missing.push('complete all required weeks');
      if (!c) missing.push("pass your organization's assignment");
      const last = missing.pop();
      const joined = missing.length ? `${missing.join(', ')} or ${last}` : last;
      reason = `To unlock your certificate, please ${joined}.`;
    }

    return res.json({ eligible, reason });
  } catch (err) {
    logErr('[cert] checkEligibility error', err);
    return res.status(500).json({ error: err.message });
  }
}

export async function listMyCertificates(req, res) {
  try {
    const studentId = req.user.id;
    console.log('[cert] listMyCertificates', { studentId });
    console.time('[cert] listMyCertificates:query');

    const { rows } = await pool.query(
      `SELECT * FROM certificates WHERE student_id = $1 ORDER BY issued_at DESC`,
      [studentId],
    );

    console.timeEnd('[cert] listMyCertificates:query');
    console.log('[cert] listMyCertificates -> count', rows.length);
    res.json(rows);
  } catch (err) {
    logErr('[cert] listMyCertificates error', err);
    res.status(500).json({ error: err.message });
  }
}

export async function getCertificate(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id' });
    console.log('[cert] getCertificate', { id });
    console.time('[cert] getCertificate:query');

    const { rows } = await pool.query(
      `SELECT * FROM certificates WHERE id = $1`,
      [id],
    );

    console.timeEnd('[cert] getCertificate:query');
    if (!rows.length) {
      console.warn('[cert] getCertificate -> not found', { id });
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    logErr('[cert] getCertificate error', err);
    res.status(500).json({ error: err.message });
  }
}

// Public verification (no auth)
export async function verifyCertificate(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id))
      return res.status(400).json({ valid: false, error: 'Invalid id' });

    console.log('[cert] verifyCertificate', { id });
    console.time('[cert] verifyCertificate:query');

    const { rows } = await pool.query(
      `SELECT c.*, u.name AS student_name, crs.title AS course_title
         FROM certificates c
         JOIN users u    ON u.id   = c.student_id
         JOIN courses crs ON crs.id = c.course_id
        WHERE c.id = $1`,
      [id],
    );

    console.timeEnd('[cert] verifyCertificate:query');
    if (!rows.length) {
      console.warn('[cert] verifyCertificate -> not found', { id });
      return res
        .status(404)
        .json({ valid: false, error: 'Certificate not found' });
    }
    return res.json({ valid: true, certificate: rows[0] });
  } catch (err) {
    logErr('[cert] verifyCertificate error', err);
    return res.status(500).json({ valid: false, error: err.message });
  }
}

// Public OG image redirect (no auth)
export async function ogPreview(req, res) {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).send('Invalid id');
    const cloudName =
      process.env.CLOUDINARY_NAME || process.env.CLOUDINARY_CLOUD_NAME;

    if (!cloudName) {
      console.error(
        '[cert] ogPreview missing CLOUDINARY_NAME/CLOUDINARY_CLOUD_NAME',
      );
      return res.status(500).send('Missing Cloudinary cloud name in env');
    }

    // Default fallbacks
    let student = '';
    let course = '';
    let brandPublicId = process.env.CERT_LOGO_PUBLIC_ID || 'branding/logo';

    console.log('[cert] ogPreview start', {
      id,
      cloudName,
      defaultBrandPublicId: brandPublicId,
    });

    // Pull student/course + per-certificate brand logo
    console.time('[cert] ogPreview:lookup');
    const { rows } = await pool.query(
      `SELECT
          u.name AS student_name,
          crs.title AS course_title,
          c.brand_logo_public_id
        FROM certificates c
        JOIN users   u   ON u.id   = c.student_id
        JOIN courses crs ON crs.id = c.course_id
       WHERE c.id = $1
       LIMIT 1`,
      [id],
    );
    console.timeEnd('[cert] ogPreview:lookup');

    if (rows.length) {
      student = rows[0].student_name || '';
      course = rows[0].course_title || '';
      // Prefer the exact brand public_id saved at generation time
      brandPublicId = rows[0].brand_logo_public_id || brandPublicId;
    } else {
      console.warn(
        '[cert] ogPreview -> certificate not found, using minimal OG',
        { id },
      );
      // You could return 404 here instead if you prefer:
      // return res.status(404).send('Certificate not found');
    }

    const url = buildOgRedirectUrl({
      cloudName,
      certificateId: id,
      brandPublicId,
      student,
      course,
    });

    console.log('[cert] ogPreview redirect', { url, brandPublicId });
    return res.redirect(302, url);
  } catch (err) {
    logErr('[cert] ogPreview error', err);
    return res.status(500).send('OG image unavailable');
  }
}

export async function generateCertificate(req, res) {
  const t0 = Date.now();
  try {
    const { error, value } = generateSchema.validate(req.body);
    if (error) {
      console.warn('[cert] generateCertificate validation failed', {
        details: error.message,
      });
      return res.status(400).json({ error: error.message });
    }

    const studentId = req.user.id;
    const { courseId } = value;
    console.log('[cert] generateCertificate start', { studentId, courseId });

    // 0) Quick Cloudinary config sanity log
    const cldcfg = cloudinary.config() || {};
    console.log('[cert] cloudinary config snapshot', {
      cloud_name: cldcfg.cloud_name,
      has_api_key: !!cldcfg.api_key,
      has_api_secret: !!cldcfg.api_secret,
    });

    // 1) If a cert already exists, return it
    console.time('[cert] generate:existing');
    const existing = await pool.query(
      `SELECT * FROM certificates WHERE student_id = $1 AND course_id = $2`,
      [studentId, courseId],
    );
    console.timeEnd('[cert] generate:existing');

    const existingRow = existing.rows[0];

    // Compute the org brand we would like to use now (same as later in the handler)
    let currentOrgBrand = null;
    try {
      currentOrgBrand = await getOrgBrandForCourse(studentId, courseId);
    } catch {}
    const desiredLogoId = publicIdFromPublicIdOrUrl(
      currentOrgBrand?.logo_url || process.env.CERT_LOGO_PUBLIC_ID || '',
    );
    const hasCorrectBrand =
      existingRow?.brand_logo_public_id &&
      desiredLogoId &&
      existingRow.brand_logo_public_id === desiredLogoId;

    if (existing.rowCount > 0 && hasCorrectBrand) {
      const base =
        process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
      console.log(
        '[cert] generateCertificate -> already exists with matching brand, returning row',
        { id: existingRow.id },
      );
      return res.json({
        ...existingRow,
        download_url: `${base}/api/certificates/${existingRow.id}/download`,
      });
    }
    // else: fall through to regenerate & overwrite to pick up org branding

    // 2) Eligibility
    console.time('[cert] generate:eligibility');
    const eligible = await isEligibleForCertificate(studentId, courseId);
    console.timeEnd('[cert] generate:eligibility');
    if (!eligible) {
      console.warn('[cert] generateCertificate -> not eligible', {
        studentId,
        courseId,
      });
      return res
        .status(400)
        .json({ error: 'Not eligible for certificate yet' });
    }

    // 2.25) Determine purchase/enrollment + org coverage
    const [purchased, enrolled] = await Promise.all([
      hasPurchasedCourse(studentId, courseId),
      hasEnrollment(studentId, courseId),
    ]);
    const orgCovered = await hasOrgCoverForCourse(studentId, courseId).catch(
      () => false,
    );
    if (orgCovered) {
      try {
        await upsertEntitlement(pool, {
          userId: studentId,
          courseId,
          extended: true,
        });
      } catch {}
    }

    // 2.5) Token-paid issuance gate:
    // Apply ONLY when NOT org-covered AND NOT purchased/enrolled.
    if (
      process.env.REQUIRE_CERT_TOKENS === 'true' &&
      !orgCovered &&
      !purchased &&
      !enrolled
    ) {
      console.time('[cert] generate:tokenIssuanceCheck');
      const issuQ = await pool.query(
        `SELECT 1
           FROM ai_certificate_issuances i
          WHERE i.user_id = $1
            AND (i.course_id IS NULL OR i.course_id = $2)
          LIMIT 1`,
        [studentId, courseId],
      );
      console.timeEnd('[cert] generate:tokenIssuanceCheck');

      let legacyOk = false;
      if (!issuQ.rowCount && process.env.ALLOW_LEGACY_CERT_PAY === 'true') {
        console.time('[cert] generate:legacyPaymentCheck]');
        const payQ = await pool.query(
          `
            SELECT 1
              FROM payments
             WHERE user_id = $1
               AND status IN ('succeeded','Completed')
               AND COALESCE(meta->>'purpose','')  = 'certificate'
               AND COALESCE(meta->>'courseId','') = $2
             LIMIT 1
          `,
          [studentId, courseId],
        );
        legacyOk = payQ.rowCount > 0;
        console.timeEnd('[cert] generate:legacyPaymentCheck]');
      }

      if (!issuQ.rowCount && !legacyOk) {
        return res.status(402).json({
          error: 'CERT_PAYMENT_REQUIRED',
          message: 'Please use tokens to claim your certificate first.',
        });
      }
    }

    // 3) Names + per-course/tutor signature
    console.time('[cert] generate:lookupUserCourse');
    const u = await pool.query(`SELECT name FROM users WHERE id = $1`, [
      studentId,
    ]);
    const c = await pool.query(
      `SELECT title, signature_public_id, tutor_id FROM courses WHERE id = $1`,
      [courseId],
    );
    console.timeEnd('[cert] generate:lookupUserCourse');

    const studentName = u.rows[0]?.name || 'Student';
    const courseTitle = c.rows[0]?.title || 'Course';
    let tutorSignaturePublicId = c.rows[0]?.signature_public_id || null;

    if (!tutorSignaturePublicId && c.rows[0]?.tutor_id) {
      try {
        console.time('[cert] generate:lookupTutorSig');
        const prof = await pool.query(
          `SELECT signature_public_id FROM profiles WHERE user_id = $1`,
          [c.rows[0].tutor_id],
        );
        console.timeEnd('[cert] generate:lookupTutorSig');
        tutorSignaturePublicId = prof.rows[0]?.signature_public_id || null;
      } catch (e) {
        console.warn('[cert] tutor signature lookup failed', e?.message);
      }
    }

    // 3.5) Org branding override (if user/course was covered by an org)
    let orgBrand = null;
    try {
      orgBrand = await getOrgBrandForCourse(studentId, courseId);
    } catch (e) {
      console.warn('[cert] org brand lookup failed', e?.message);
    }

    // Prefer org values; fall back to ENV
    const brandName =
      (orgBrand?.name && String(orgBrand.name).trim()) ||
      process.env.CERT_BRAND_NAME ||
      'DayBreak Academy';

    // Accept public_id OR full URL (the PDF service handles both)
    const logoSource = orgBrand?.logo_url || process.env.CERT_LOGO_PUBLIC_ID;
    const registrarSigSource =
      orgBrand?.signature_url || process.env.CERT_SIGNATURE_PUBLIC_ID;
    if (orgBrand?.instructor_signature_url) {
      tutorSignaturePublicId = orgBrand.instructor_signature_url;
    }

    const headerTitle =
      orgBrand?.certificate_title || 'Certificate of Completion';

    // Build a single brand object so we reuse it for PDF and OG storage
    const brand = {
      name: brandName,
      logoPublicId: logoSource,
      signaturePublicId: registrarSigSource,
    };

    // 4) Create DB row to get UUID (handle rare duplicate by reselecting)
    console.time('[cert] generate:insertRow');
    let inserted;
    try {
      inserted = await pool.query(
        `INSERT INTO certificates (id, student_id, course_id, url)
         VALUES (gen_random_uuid(), $1, $2, '')
         RETURNING *`,
        [studentId, courseId],
      );
    } catch (e) {
      console.warn('[cert] insert race? reselecting existing row', e?.message);
      inserted = await pool.query(
        `SELECT * FROM certificates WHERE student_id = $1 AND course_id = $2`,
        [studentId, courseId],
      );
      if (inserted.rowCount === 0) throw e; // real error
    }
    console.timeEnd('[cert] generate:insertRow');

    const cert = inserted.rows[0];
    console.log('[cert] generateCertificate inserted row', { certId: cert.id });

    // 5) Build a public verification URL (no auth)
    const base =
      process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
    const verificationUrl = `${base}/api/certificates/verify/${cert.id}`;

    // 6) Create in-memory PDF (branded for org when present)
    console.time('[cert] generate:renderPdf');
    const buffer = await generateCertificatePdfBuffer({
      studentName,
      courseTitle,
      verificationUrl,
      titleText: headerTitle,
      brand, // <-- unified brand payload
      tutorSignaturePublicId,
    });
    console.timeEnd('[cert] generate:renderPdf');
    console.log('[cert] pdf buffer bytes', { size: buffer?.byteLength ?? 0 });

    if (!buffer || !buffer.length) {
      console.error('[cert] empty PDF buffer generated');
      return res
        .status(500)
        .json({ error: 'Failed to generate certificate PDF' });
    }

    // 7) Upload to Cloudinary
    console.time('[cert] generate:cloudinaryUpload');
    const uploadPromise = new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          resource_type: 'image', // supports pg_1 & overlays on PDFs
          folder: 'certificates',
          public_id: cert.id,
          format: 'pdf',
          overwrite: true,
        },
        (err, result) => {
          if (err) {
            console.error('[cert] cloudinary upload error', err);
            reject(err);
          } else {
            console.log('[cert] cloudinary upload success', {
              public_id: result?.public_id,
              version: result?.version,
              secure_url: result?.secure_url,
            });
            resolve(result.secure_url);
          }
        },
      );
      Readable.from(buffer).pipe(upload);
    });

    const uploadTimeoutMs = Number(process.env.CERT_UPLOAD_TIMEOUT_MS || 45000);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error('Cloudinary upload timed out')),
        uploadTimeoutMs,
      ),
    );

    const url = await Promise.race([uploadPromise, timeoutPromise]);
    console.timeEnd('[cert] generate:cloudinaryUpload');

    if (!url) {
      console.error('[cert] upload returned empty url');
      return res.status(502).json({ error: 'Upload failed' });
    }

    // 8) Save URL + per-certificate brand logo public_id for OG previews
    // Prefer a real public_id derived from what we actually used; fallback to env default.
    const brandLogoPublicIdForOg =
      publicIdFromPublicIdOrUrl(brand.logoPublicId) ||
      process.env.CERT_LOGO_PUBLIC_ID ||
      'branding/logo';

    console.time('[cert] generate:updateUrl');
    const updated = await pool.query(
      `UPDATE certificates
          SET url = $1,
              brand_logo_public_id = $2
        WHERE id = $3
      RETURNING *`,
      [url, brandLogoPublicIdForOg, cert.id],
    );
    console.timeEnd('[cert] generate:updateUrl');

    const row = updated.rows[0];
    const download_url = `${base}/api/certificates/${row.id}/download`;

    console.log('[cert] generateCertificate done', {
      certId: cert.id,
      totalMs: Date.now() - t0,
    });

    return res.json({ ...row, download_url });
  } catch (err) {
    try {
      const cfg = cloudinary.config();
      console.error('[cert] generateCertificate error', err, {
        cloudinary_cloud_name: cfg?.cloud_name,
        has_api_key: !!cfg?.api_key,
        has_api_secret: !!cfg?.api_secret,
      });
    } catch {
      console.error('[cert] generateCertificate error (no cfg)', err);
    }
    return res
      .status(500)
      .json({ error: err?.message || 'Failed to generate certificate' });
  }
}

export async function downloadCertificate(req, res) {
  try {
    const studentId = req.user.id;
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ error: 'Invalid id' });

    console.log('[cert] downloadCertificate start', { studentId, id });

    console.time('[cert] download:lookup');
    const { rows } = await pool.query(
      `SELECT id, student_id, course_id, url
         FROM certificates
        WHERE id = $1`,
      [id],
    );
    console.timeEnd('[cert] download:lookup');

    if (!rows.length) {
      console.warn('[cert] downloadCertificate -> not found', { id });
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const cert = rows[0];
    if (cert.student_id !== studentId) {
      console.warn('[cert] downloadCertificate -> forbidden', {
        studentId,
        owner: cert.student_id,
      });
      return res
        .status(403)
        .json({ error: 'Not allowed to download this certificate' });
    }
    if (!cert.url) {
      console.warn('[cert] downloadCertificate -> empty url', { id });
      return res.status(400).json({ error: 'Certificate has no file URL yet' });
    }

    // Friendly filename
    let suggestedFilename = `certificate-${cert.id}.pdf`;
    try {
      console.time('[cert] download:courseTitle');
      const meta = await pool.query(`SELECT title FROM courses WHERE id = $1`, [
        cert.course_id,
      ]);
      console.timeEnd('[cert] download:courseTitle');
      if (meta.rowCount) {
        const clean = String(meta.rows[0].title || 'course')
          .replace(/[^\w\s.-]+/g, '')
          .replace(/\s+/g, '-')
          .toLowerCase();
        suggestedFilename = `${clean}-${cert.id}.pdf`;
      }
    } catch (e) {
      console.warn('[cert] download:courseTitle lookup failed', e?.message);
    }

    const streamUrlToClient = async (url, note = 'plain') => {
      console.log('[cert] streaming from Cloudinary', { note, url });
      console.time(`[cert] download:cloudinaryFetch:${note}`);
      const upstream = await axios.get(url, {
        responseType: 'stream',
        validateStatus: () => true,
      });
      console.timeEnd(`[cert] download:cloudinaryFetch:${note}`);

      if (upstream.status !== 200) {
        const xErr = upstream.headers?.['x-cld-error'];
        const err = new Error(
          xErr
            ? `Cloudinary error: ${xErr}`
            : `Upstream fetch failed (${upstream.status})`,
        );
        err.status = upstream.status;
        throw err;
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${suggestedFilename}"`,
      );

      const len = upstream.headers['content-length'];
      if (len) res.setHeader('Content-Length', len);

      upstream.data.on('error', (e) => {
        logErr('[cert] stream error', e);
        if (!res.headersSent)
          res.status(502).end('Failed to fetch certificate file');
        else res.end();
      });

      upstream.data.pipe(res);
    };

    try {
      // Try public delivery
      await streamUrlToClient(cert.url, 'public');
      console.log('[cert] downloadCertificate success (public)', { id });
      return;
    } catch (e) {
      if (e?.status !== 401) {
        logErr('[cert] downloadCertificate upstream error (non-401)', e);
        throw e;
      }

      // ACL / authenticated delivery → sign and retry (robust)
      const cfg = cloudinary.config() || {};
      if (!cfg.api_key || !cfg.api_secret) {
        console.error(
          '[cert] Missing Cloudinary API credentials for private download URL',
          {
            cloud_name: cfg.cloud_name,
            has_api_key: !!cfg.api_key,
            has_api_secret: !!cfg.api_secret,
          },
        );
        return res.status(502).json({
          error:
            'Cloudinary private download requires API credentials. Set CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and restart the server.',
        });
      }

      // Derive public_id, e.g. "certificates/<uuid>"
      let publicId = null;
      try {
        const urlObj = new URL(cert.url);
        const parts = urlObj.pathname.split('/');
        const idx = parts.findIndex((p) => p === 'certificates');
        if (idx >= 0 && parts[idx + 1]) {
          publicId = `certificates/${parts[idx + 1].replace(/\.pdf$/i, '')}`;
        }
      } catch (_) {}
      if (!publicId) {
        console.warn(
          '[cert] Could not parse public_id from URL; using DB id fallback',
        );
        publicId = `certificates/${cert.id}`;
      }

      const tryPrivateDownload = async (dlType) => {
        const privateUrl = cloudinary.utils.private_download_url(
          publicId,
          'pdf',
          {
            resource_type: 'image', // you uploaded as resource_type image
            type: dlType, // 'upload' | 'authenticated' | 'private'
            attachment: true,
            attachment_filename: suggestedFilename,
            expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
            sign_url: true,
          },
        );
        console.log('[cert] streaming via private_download_url', {
          publicId,
          type: dlType,
        });
        await streamUrlToClient(privateUrl, `private-download-${dlType}`);
      };

      // Try types in order; many setups will be 'authenticated'
      const typesToTry = ['upload', 'authenticated', 'private'];
      let ok = false;
      for (const t of typesToTry) {
        try {
          await tryPrivateDownload(t);
          ok = true;
          console.log('[cert] downloadCertificate success (private-download)', {
            id,
            type: t,
          });
          break;
        } catch (e2) {
          if (e2?.status && e2.status !== 404 && e2.status !== 401) throw e2; // non-ACL/non-not-found error
          console.warn('[cert] private_download_url failed; trying next type', {
            type: t,
            status: e2?.status,
          });
        }
      }

      if (!ok) {
        // Final fallback: build a signed delivery URL for type 'authenticated' (works when folder is authenticated)
        // You can include the version from the stored URL to avoid cache issues.
        const urlObj = new URL(cert.url);
        const verMatch = urlObj.pathname.match(/\/v(\d+)\//);
        const version = verMatch
          ? urlObj.pathname.match(/\/v(\d+)\//)[1]
          : undefined;

        const signedDeliveryUrl = cloudinary.utils.url(publicId, {
          resource_type: 'image',
          type: 'authenticated',
          format: 'pdf',
          sign_url: true,
          version, // include if present
          // Force attachment filename client-side by setting header here instead of fl_attachment in URL:
          // we already set Content-Disposition on the response, so no need to add flags.
        });

        console.log(
          '[cert] streaming via signed delivery URL (authenticated)',
          { publicId, version },
        );
        await streamUrlToClient(
          signedDeliveryUrl,
          'signed-delivery-authenticated',
        );
        console.log('[cert] downloadCertificate success (signed-delivery)', {
          id,
        });
      }
    }
  } catch (err) {
    logErr('[cert] downloadCertificate error', err);
    const status = (err && err.status) || 500;
    return res
      .status(status)
      .json({ error: err?.message || 'Download failed' });
  }
}

export async function getStatus(req, res) {
  try {
    const userId = req.user?.id; // numeric users.id
    const authUuid = pickAuthUuidFromReqUser(req.user); // ✅ ADD THIS LINE

    const courseId = String(req.query.courseId || '');
    if (!userId)
      return res.status(401).json({ paid: false, error: 'Unauthorized' });
    if (!courseId || !isUuid(courseId))
      return res.status(400).json({ paid: false, error: 'Invalid courseId' });

    const [certQ, orgQ, issuQ, ent, purQ, enrQ] = await Promise.all([
      pool.query(
        `SELECT 1 FROM certificates WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
        [userId, courseId],
      ),
      pool.query(
        `SELECT 1
           FROM org_quiz_attempts q
           JOIN org_course_assignments a ON a.id = q.assignment_id
          WHERE q.user_id = $1 AND a.course_id = $2
            AND q.submitted_at IS NOT NULL AND q.passed = TRUE
          LIMIT 1`,
        [userId, courseId],
      ),
      pool.query(
        `SELECT 1 FROM ai_certificate_issuances
          WHERE user_id = $1 AND (course_id IS NULL OR course_id = $2)
          LIMIT 1`,
        [userId, courseId],
      ),
      getEntitlement(pool, userId, courseId).catch(() => null),
      pool.query(
        `SELECT 1 FROM course_purchases WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
        [userId, courseId],
      ),
      pool.query(
        `SELECT 1 FROM enrollments WHERE student_id = $1 AND course_id = $2 LIMIT 1`,
        [userId, courseId],
      ),
    ]);

    const orgCovered = orgQ.rowCount > 0;
    const purchased = purQ.rowCount > 0;
    const enrolled = enrQ.rowCount > 0;

    const extendedByIssuance = await hasExtendedByIssuance(userId, courseId);

    const hasAnyCert =
      orgCovered ||
      purchased ||
      enrolled ||
      !!ent?.can_certificate ||
      certQ.rowCount > 0 ||
      issuQ.rowCount > 0;

    const extended =
      orgCovered || ent?.can_transcript === true || extendedByIssuance;

    // Heal entitlement if we learned something new
    if (extended && (!ent || ent.can_transcript !== true)) {
      try {
        await upsertEntitlement(pool, { userId, courseId, extended: true });
      } catch {}
    } else if (hasAnyCert && ent && ent.can_certificate !== true && !extended) {
      try {
        await upsertEntitlement(pool, { userId, courseId, extended: false });
      } catch {}
    }

    // ✅ INSERT YOUR BLOCK RIGHT HERE (after hasAnyCert is known)
    // Ensure "Purchased AI courses" reflects certificate pre-purchases (and org cover).
    if (hasAnyCert) {
      const userUuid =
        authUuid ||
        (userId ? await resolveAuthUuidForNumericUserId(userId) : null);

      if (userUuid) {
        try {
          await upsertAiCertificateEntitlement({
            userId: userUuid,           // ✅ UUID, not numeric
            courseId,                   // validated uuid
            courseSource: 'catalog',
            maxLessons: 60,
            // orgId: orgCovered ? someOrgId : null, // optional if you track it
          });
        } catch (e) {
          console.warn(
            '[cert] getStatus: upsertAiCertificateEntitlement failed',
            e?.message,
          );
        }
      }
    }

    const tier = extended
      ? 'extended'
      : ent?.tier || (hasAnyCert ? 'standard' : null);

    return res.json({
      paid: Boolean(hasAnyCert),
      tier,
      extended: Boolean(extended),
      canTranscript: Boolean(extended),
      hasCertificate: Boolean(ent?.can_certificate || certQ.rowCount),
      canCertificate: Boolean(hasAnyCert),
    });
  } catch (err) {
    console.error('[cert] getStatus error', err);
    return res.status(500).json({ paid: false, error: err.message });
  }
}


export async function listMyAiCourses(req, res) {
  try {
    const numericUserId = req.user?.id; // your existing numeric users.id (e.g. 1631)
    const authUuidFromToken = pickAuthUuidFromReqUser(req.user);

    if (!numericUserId && !authUuidFromToken) {
      return res.status(401).json({ error: 'UNAUTHORIZED' });
    }

    // ✅ This is the critical fix: use a UUID for ai_course_entitlements.user_id
    const userUuid =
      authUuidFromToken ||
      (numericUserId ? await resolveAuthUuidForNumericUserId(numericUserId) : null);

    // If we can’t resolve a UUID, don’t 500
    if (!userUuid) {
      let entitlements = await getEntitlementsForUser(userUuid);

      // ✅ Heal missing entitlements from issuances (token purchases)
      if ((!entitlements || !entitlements.length) && numericUserId) {
        try {
          const issu = await pool.query(
            `
            SELECT DISTINCT course_id
              FROM ai_certificate_issuances
            WHERE user_id = $1
              AND course_id IS NOT NULL
            `,
            [numericUserId],
          );

          for (const r of issu.rows) {
            const cid = String(r.course_id || '').trim();
            if (!cid) continue;

            await upsertAiCertificateEntitlement({
              userId: userUuid,
              courseId: cid,
              courseSource: isUuid(cid) ? 'catalog' : 'typed',
              maxLessons: 60,
            });
          }

          entitlements = await getEntitlementsForUser(userUuid);
        } catch (e) {
          console.warn('[cert] listMyAiCourses: seed from issuances failed', e?.message);
        }
      }

      console.warn('[cert] listMyAiCourses: could not resolve auth UUID', {
        numericUserId,
        hasTokenSub: !!req.user?.sub,
      });
      return res.json({ items: [] });
    }

    // Pull entitlements by UUID (prevents "1631" -> uuid crash)
    const entitlements = await getEntitlementsForUser(userUuid);
    if (!entitlements?.length) return res.json({ items: [] });

    const courseIds = entitlements
      .map((e) => e.course_id)
      .filter((c) => typeof c === 'string' && c.length);

    const uuidCourseIds = courseIds.filter((c) => isUuid(c));

    const courseMeta = uuidCourseIds.length
      ? await pool.query(
          `SELECT id::text, title, pass_mark
             FROM courses
            WHERE id = ANY($1::uuid[])`,
          [uuidCourseIds],
        )
      : { rows: [] };

    const metaById = new Map(courseMeta.rows.map((r) => [r.id, r]));

    // Org attempts are tied to your numeric users.id in this schema,
    // so only query attempts when numericUserId exists.
    const attemptsQ =
      uuidCourseIds.length && numericUserId
        ? await pool.query(
            `
            SELECT a.course_id::text AS course_id,
                   qa.score_pct,
                   qa.pass_mark,
                   qa.passed
              FROM org_quiz_attempts qa
              JOIN org_course_assignments a ON a.id = qa.assignment_id
             WHERE qa.user_id::text = $1::text
               AND a.course_id = ANY($2::uuid[])
             ORDER BY qa.created_at DESC
            `,
            [numericUserId, uuidCourseIds],
          )
        : { rows: [] };

    const attemptByCourse = new Map();
    for (const row of attemptsQ.rows || []) {
      if (!attemptByCourse.has(row.course_id)) {
        attemptByCourse.set(row.course_id, row);
      }
    }

    const items = entitlements.map((ent) => {
      const meta = metaById.get(ent.course_id) || {};
      const att = attemptByCourse.get(ent.course_id) || {};
      const passMark = Number(meta.pass_mark ?? att.pass_mark ?? 60) || 60;
      const attempted = att.score_pct != null;
      const passed =
        att.passed === true || (attempted && Number(att.score_pct) >= passMark);

      return {
        course_id: ent.course_id,
        course_source: ent.course_source,
        title: meta.title || 'AI Course',
        purchased_at: ent.created_at,
        lessons_used: ent.lessons_used,
        max_lessons: ent.max_lessons,
        completion: {
          attempted,
          passed,
          score_pct: att.score_pct ?? null,
          pass_mark: passMark,
        },
      };
    });

    return res.json({ items });
  } catch (err) {
    console.error('[cert] listMyAiCourses error', err);
    return res.status(500).json({ error: 'FAILED_TO_LIST' });
  }
}
