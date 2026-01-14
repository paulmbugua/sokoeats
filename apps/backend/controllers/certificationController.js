// apps/backend/controllers/certificationController.js

import express from 'express';
import pool from '../config/db.js';
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuid } from 'uuid';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Strict UUID (v1–v5) check */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v) {
  return UUID_RE.test(String(v || '').trim());
}

function normalizeDocuments(documents) {
  if (Array.isArray(documents)) return documents;
  if (typeof documents === 'string') {
    try {
      const parsed = JSON.parse(documents);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Upload an array of { buffer, originalname, mimeType } to Cloudinary.
 * Chooses resource_type based on mimeType.
 */
async function uploadCertDocs(files) {
  return Promise.all(
    files.map(({ buffer, originalname, mimeType }) => {
      const dataUri = `data:${mimeType};base64,${buffer.toString('base64')}`;
      const resourceType = mimeType.startsWith('image/')
        ? 'image'
        : mimeType === 'application/pdf'
          ? 'raw'
          : 'auto';

      return cloudinary.uploader
        .upload(dataUri, {
          resource_type: resourceType,
          folder: 'certifications',
          public_id: `cert_${uuid()}`,
        })
        .then((res) => res.secure_url);
    }),
  );
}

/** Cache detected profile column types (avoid re-checking every request) */
let _profilesShapeCache = null;

async function getProfilesShape() {
  if (_profilesShapeCache) return _profilesShapeCache;

  // We care about whether profiles.user_id exists and what type it is.
  // If it’s uuid, never compare it with integers.
  const { rows } = await pool.query(
    `
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'profiles'
       AND column_name IN ('id','user_id')
    `,
  );

  const hasUserId = rows.some((r) => r.column_name === 'user_id');
  const userIdType =
    rows.find((r) => r.column_name === 'user_id')?.data_type || null;

  _profilesShapeCache = { hasUserId, userIdType };
  return _profilesShapeCache;
}

// ─── 1. Submit Certification ─────────────────────────────────────────────────
export const submitCertification = [
  // allow large JSON payloads for base64 files
  express.json({ limit: '50mb' }),

  async (req, res) => {
    try {
      // a) Validate profileId (this endpoint expects numeric profile id)
      const profileId = parseInt(req.params.profileId, 10);
      if (isNaN(profileId)) {
        return res.status(400).json({ message: 'Invalid profileId' });
      }

      // b) Fetch tutor name
      const profileRes = await pool.query(
        'SELECT name FROM profiles WHERE id = $1',
        [profileId],
      );
      if (profileRes.rowCount === 0) {
        return res.status(404).json({ message: 'Profile not found' });
      }
      const tutorName = profileRes.rows[0].name;

      // c) Validate files array
      const { files } = req.body;
      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: 'No files provided' });
      }

      // d) Decode base64 → Buffer and collect mimeType + original name
      const uploadInputs = files.map(({ name, type, base64 }) => {
        if (!name || !type || !base64) {
          throw new Error(`Missing name/type/base64 in file: ${name}`);
        }
        return {
          buffer: Buffer.from(base64, 'base64'),
          originalname: name,
          mimeType: type,
        };
      });

      // e) Upload to Cloudinary
      const documentUrls = await uploadCertDocs(uploadInputs);

      // f) Persist certification record
      const insertRes = await pool.query(
        `INSERT INTO certifications
           (profile_id, tutor_name, documents, status, submitted_at)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [
          profileId,
          tutorName,
          JSON.stringify(documentUrls),
          'Pending',
          new Date(),
        ],
      );
      const certification = insertRes.rows[0];

      // g) Mark profile.certified = false
      await pool.query(
        `UPDATE profiles
            SET certified = false, updated_at = NOW()
          WHERE id = $1`,
        [profileId],
      );

      // h) Return response
      return res.status(200).json({
        message:
          'Certification submitted successfully and is pending verification.',
        certification,
        certified: false,
      });
    } catch (err) {
      console.error('Error submitting certification:', err);
      return res.status(500).json({
        message: 'Error submitting certification.',
        error: err.message,
      });
    }
  },
];

// ─── 2. Verify Certification ─────────────────────────────────────────────────
export const verifyCertification = async (req, res) => {
  try {
    const profileId = parseInt(req.params.profileId, 10);
    if (isNaN(profileId)) {
      return res.status(400).json({ message: 'Invalid profileId' });
    }

    // a) Update certification status
    const updateRes = await pool.query(
      `UPDATE certifications
         SET status = 'Verified',
             verified_at = NOW(),
             updated_at  = NOW()
       WHERE profile_id = $1
       RETURNING *`,
      [profileId],
    );
    const certification = updateRes.rows[0];
    if (!certification) {
      return res.status(404).json({ message: 'Certification not found.' });
    }

    // b) Mark profile.certified = true
    await pool.query(
      `UPDATE profiles
          SET certified = true, updated_at = NOW()
        WHERE id = $1`,
      [profileId],
    );

    // c) Return updated status
    return res.status(200).json({
      message: 'Certification verified successfully.',
      certification,
      certified: true,
    });
  } catch (err) {
    console.error('Error verifying certification:', err);
    return res.status(500).json({
      message: 'Error verifying certification.',
      error: err.message,
    });
  }
};

// ─── 3. Get Certification Status ─────────────────────────────────────────────
export const getCertificationStatus = async (req, res) => {
  try {
    const raw = String(req.params.profileId ?? '').trim();
    if (!raw) {
      return res.status(400).json({ message: 'Invalid profileId' });
    }

    const shape = await getProfilesShape();

    let profRes;

    // If caller passes a UUID (usually auth user id), match by profiles.user_id::uuid
    if (isUuid(raw)) {
      if (!shape.hasUserId) {
        return res.status(404).json({ message: 'Profile not found.' });
      }
      profRes = await pool.query(
        `SELECT id, certified
           FROM profiles
          WHERE user_id = $1::uuid
          LIMIT 1`,
        [raw],
      );
    } else {
      // Numeric param (profile id). Only compare to profiles.user_id if it's numeric.
      const param = Number(raw);
      if (!Number.isFinite(param)) {
        return res.status(400).json({ message: 'Invalid profileId' });
      }

      // Safe: always allow lookup by profiles.id
      // Optional: allow lookup by profiles.user_id ONLY if user_id is integer/bigint
      const userIdNumericOk =
        shape.hasUserId && (shape.userIdType === 'integer' || shape.userIdType === 'bigint');

      profRes = userIdNumericOk
        ? await pool.query(
            `SELECT id, certified
               FROM profiles
              WHERE id = $1 OR user_id = $1
              LIMIT 1`,
            [param],
          )
        : await pool.query(
            `SELECT id, certified
               FROM profiles
              WHERE id = $1
              LIMIT 1`,
            [param],
          );
    }

    if (!profRes || profRes.rowCount === 0) {
      return res.status(404).json({ message: 'Profile not found.' });
    }

    const { id: realProfileId, certified } = profRes.rows[0];

    // Fetch latest certification
    const certRes = await pool.query(
      `SELECT id, profile_id, tutor_name, documents, status, submitted_at, verified_at
         FROM certifications
        WHERE profile_id = $1
     ORDER BY submitted_at DESC
        LIMIT 1`,
      [realProfileId],
    );
    if (certRes.rowCount === 0) {
      return res.status(404).json({ message: 'Certification not found.' });
    }

    const row = certRes.rows[0];
    const documents =
      typeof row.documents === 'string'
        ? JSON.parse(row.documents)
        : row.documents;

    return res.status(200).json({
      certification: { ...row, documents },
      certified,
    });
  } catch (err) {
    console.error('Error fetching certification status:', err);
    return res.status(500).json({
      message: 'Error fetching certification status.',
      error: err.message,
    });
  }
};

// ─── 4. Admin: List Certifications ─────────────────────────────────────────
export const listCertifications = async (req, res) => {
  try {
    const rawStatus = String(req.query.status || '').trim();
    const status = rawStatus && rawStatus !== 'All' ? rawStatus : null;
    const q = String(req.query.q || '').trim();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const conditions = [];
    const values = [];
    let idx = 1;

    if (status) {
      conditions.push(`c.status = $${idx++}`);
      values.push(status);
    }

    if (q) {
      conditions.push(
        `(c.tutor_name ILIKE $${idx} OR p.name ILIKE $${idx} OR CAST(c.profile_id AS TEXT) ILIKE $${idx})`,
      );
      values.push(`%${q}%`);
      idx += 1;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const sql = `
      SELECT c.id,
             c.profile_id,
             c.tutor_name,
             c.documents,
             c.status,
             c.submitted_at,
             c.verified_at,
             p.certified AS profile_certified,
             p.user_id AS profile_user_id,
             p.name AS profile_name
        FROM certifications c
        JOIN profiles p ON p.id = c.profile_id
        ${where}
       ORDER BY c.submitted_at DESC
       LIMIT $${idx++}
      OFFSET $${idx++};
    `;

    const countSql = `
      SELECT COUNT(*)::int AS total
        FROM certifications c
        JOIN profiles p ON p.id = c.profile_id
        ${where};
    `;

    const [listRes, countRes] = await Promise.all([
      pool.query(sql, [...values, limit, offset]),
      pool.query(countSql, values),
    ]);

    const rows = listRes.rows.map((row) => ({
      ...row,
      documents: normalizeDocuments(row.documents),
    }));

    return res.status(200).json({
      success: true,
      rows,
      total: countRes.rows?.[0]?.total ?? rows.length,
    });
  } catch (err) {
    console.error('Error listing certifications:', err);
    return res.status(500).json({
      message: 'Error fetching certifications.',
      error: err.message,
    });
  }
};

// ─── 5. Admin: Get Certification By ID ─────────────────────────────────────
export const getCertificationById = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: 'Invalid certification id' });
    }

    const { rows } = await pool.query(
      `SELECT c.id,
              c.profile_id,
              c.tutor_name,
              c.documents,
              c.status,
              c.submitted_at,
              c.verified_at,
              p.certified AS profile_certified,
              p.user_id AS profile_user_id,
              p.name AS profile_name
         FROM certifications c
         JOIN profiles p ON p.id = c.profile_id
        WHERE c.id = $1
        LIMIT 1`,
      [id],
    );

    if (!rows.length) return res.status(404).json({ message: 'Certification not found.' });

    const row = rows[0];
    return res.status(200).json({
      success: true,
      certification: { ...row, documents: normalizeDocuments(row.documents) },
    });
  } catch (err) {
    console.error('Error fetching certification by id:', err);
    return res.status(500).json({
      message: 'Error fetching certification.',
      error: err.message,
    });
  }
};
