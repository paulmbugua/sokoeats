import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';

const notImplemented = (_req, res) =>
  res.status(501).json({ success: false, message: 'Not implemented' });

function isMissingDbObject(error) {
  return ['42P01', '42703'].includes(error?.code);
}

async function queryOrEmpty(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (error) {
    if (isMissingDbObject(error)) return { rows: [], rowCount: 0 };
    throw error;
  }
}

export async function listPackages(_req, res) {
  const { rows } = await queryOrEmpty(
    'SELECT * FROM packages ORDER BY credits ASC, currency ASC',
  );
  return res.json({ success: true, packages: rows });
}

export async function upsertPackagePair(req, res) {
  const credits = Number(req.body?.credits ?? req.params?.credits);
  const offer = req.body?.offer ?? null;
  const priceUSD = req.body?.priceUSD ?? req.body?.usd;
  const priceKES = req.body?.priceKES ?? req.body?.kes;

  if (!Number.isFinite(credits) || credits <= 0) {
    return res.status(400).json({ success: false, message: 'Valid credits are required' });
  }

  const rows = [];
  for (const [currency, price] of [
    ['USD', priceUSD],
    ['KES', priceKES],
  ]) {
    if (price == null || price === '') continue;
    const result = await pool.query(
      `INSERT INTO packages (credits, price, currency, offer)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (credits, currency)
       DO UPDATE SET price = EXCLUDED.price, offer = EXCLUDED.offer
       RETURNING *`,
      [credits, Number(price), currency, offer],
    );
    rows.push(result.rows[0]);
  }

  return res.status(200).json({ success: true, packages: rows });
}

export const upsertPackage = upsertPackagePair;

export async function updatePackage(req, res) {
  const id = req.params.id;
  const { credits, price, currency, offer } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE packages
        SET credits = COALESCE($2, credits),
            price = COALESCE($3, price),
            currency = COALESCE($4, currency),
            offer = COALESCE($5, offer)
      WHERE id = $1
      RETURNING *`,
    [id, credits ?? null, price ?? null, currency ?? null, offer ?? null],
  );

  if (!rows[0]) return res.status(404).json({ success: false, message: 'Package not found' });
  return res.json({ success: true, package: rows[0] });
}

export async function deletePackage(req, res) {
  const value = req.params.credits ?? req.params.id;
  const byCredits = Boolean(req.params.credits);
  const result = await pool.query(
    byCredits ? 'DELETE FROM packages WHERE credits = $1' : 'DELETE FROM packages WHERE id = $1',
    [value],
  );
  return res.json({ success: true, deleted: result.rowCount });
}

export async function listTransactions(_req, res) {
  const { rows } = await queryOrEmpty(
    `SELECT p.*, u.email, u.name
       FROM payments p
       LEFT JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 250`,
  );
  return res.json({ success: true, transactions: rows });
}

export async function listFinancialFeed(req, res) {
  return listTransactions(req, res);
}

export async function listUsers(_req, res) {
  const { rows } = await queryOrEmpty(
    `SELECT id, email, name, role, tokens, created_at
       FROM users
      ORDER BY created_at DESC
      LIMIT 500`,
  );
  return res.json({ success: true, users: rows });
}

export async function adminSetRole(req, res) {
  const { userId, role } = req.body || {};
  if (!userId || !role) {
    return res.status(400).json({ success: false, message: 'userId and role are required' });
  }
  const { rows } = await pool.query(
    'UPDATE users SET role = $2 WHERE id = $1 RETURNING id, email, name, role',
    [userId, role],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminAdjustTokens(req, res) {
  const { userId } = req.body || {};
  const delta = Number(req.body?.delta ?? req.body?.amount ?? 0);
  if (!userId || !Number.isFinite(delta)) {
    return res.status(400).json({ success: false, message: 'userId and numeric delta are required' });
  }
  const { rows } = await pool.query(
    'UPDATE users SET tokens = COALESCE(tokens, 0) + $2 WHERE id = $1 RETURNING id, email, tokens',
    [userId, delta],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminDeleteUser(req, res) {
  const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  return res.json({ success: true, deleted: result.rowCount });
}

export async function adminResetPassword(req, res) {
  const password = req.body?.password;
  if (!password || String(password).length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  const hashed = await bcrypt.hash(String(password), 10);
  const { rows } = await pool.query(
    'UPDATE users SET password = $2 WHERE id = $1 RETURNING id, email',
    [req.params.id, hashed],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
  return res.json({ success: true, user: rows[0] });
}

export async function adminImpersonateUser(req, res) {
  const { rows } = await pool.query(
    'SELECT id, email, role FROM users WHERE id = $1 LIMIT 1',
    [req.params.id],
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, impersonated: true },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' },
  );
  return res.json({ success: true, token });
}

export const proofOfFulfillment = notImplemented;


function reviewStatusPatch(documentType, status) {
  if (documentType === 'profile_image') return { statusColumn: 'profile_image_status', status };
  if (documentType === 'id_document') return { statusColumn: 'id_document_status', status };
  if (documentType === 'certificate') return { statusColumn: 'certificate_status', status };
  if (documentType === 'good_conduct') return { statusColumn: 'good_conduct_status', status };
  return null;
}

async function recalculateAdminHandymanVerification(db, handymanUserId) {
  const { rows } = await db.query(
    `UPDATE ekazi_handyman_profiles
        SET verified = profile_image_status = 'approved' AND id_document_status = 'approved',
            verification_status = CASE
              WHEN profile_image_status = 'approved' AND id_document_status = 'approved' THEN 'active'
              WHEN profile_image_url IS NOT NULL OR id_document_url IS NOT NULL OR certificate_url IS NOT NULL OR good_conduct_url IS NOT NULL THEN 'pending_review'
              ELSE 'incomplete'
            END,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
    [handymanUserId],
  );
  return rows[0] || null;
}

export async function listHandymanVerificationReviews(req, res) {
  try {
    await ensureMarketplaceSchema();
    const status = String(req.query?.status || 'pending');
    const params = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = 'WHERE r.status = $1';
    }
    const { rows } = await pool.query(
      `SELECT r.*, u.name, u.email, u.phone,
              hp.business_name, hp.verified, hp.verification_status,
              hp.profile_image_status, hp.id_document_status, hp.certificate_status, hp.good_conduct_status,
              hp.profile_image_url, hp.id_document_url, hp.certificate_url, hp.good_conduct_url
         FROM ekazi_handyman_verification_reviews r
         JOIN users u ON u.id = r.handyman_user_id
         LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = r.handyman_user_id
        ${where}
        ORDER BY CASE r.status WHEN 'pending' THEN 0 ELSE 1 END, r.updated_at DESC
        LIMIT 300`,
      params,
    );
    return res.json({ success: true, reviews: rows });
  } catch (error) {
    console.error('listHandymanVerificationReviews error:', error);
    return res.status(500).json({ success: false, message: 'Could not load verification reviews' });
  }
}

export async function reviewHandymanVerification(req, res) {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const reviewId = Number(req.params.id);
    const status = String(req.body?.status || '').toLowerCase();
    const notes = String(req.body?.notes || '').trim().slice(0, 500) || null;
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid review id' });
    }
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved, rejected or pending' });
    }
    await client.query('BEGIN');
    const reviewResult = await client.query(
      `UPDATE ekazi_handyman_verification_reviews
          SET status = $2,
              notes = $3,
              reviewed_by = $4,
              reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE NOW() END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [reviewId, status, notes, req.adminUserId || null],
    );
    const review = reviewResult.rows[0];
    if (!review) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Review not found' });
    }
    const patch = reviewStatusPatch(review.document_type, status);
    if (!patch) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Unsupported document type' });
    }
    await client.query(
      `UPDATE ekazi_handyman_profiles
          SET ${patch.statusColumn} = $2,
              updated_at = NOW()
        WHERE user_id = $1`,
      [review.handyman_user_id, patch.status],
    );
    const profile = await recalculateAdminHandymanVerification(client, review.handyman_user_id);
    await client.query('COMMIT');
    return res.json({ success: true, review, profile });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('reviewHandymanVerification error:', error);
    return res.status(500).json({ success: false, message: 'Could not update verification review' });
  } finally {
    client.release();
  }
}


export async function getAdminApprovalsOverview(_req, res) {
  try {
    await ensureMarketplaceSchema();
    await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'");
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ');
    const [verifications, jobs, quotes, bookings, users, recentDocs, recentCancellations] = await Promise.all([
      pool.query(`
        SELECT status, COUNT(*)::int AS count
          FROM ekazi_handyman_verification_reviews
         GROUP BY status
      `),
      pool.query(`
        SELECT status, COUNT(*)::int AS count
          FROM ekazi_jobs
         GROUP BY status
      `),
      pool.query(`
        SELECT status, COUNT(*)::int AS count
          FROM ekazi_quotes
         GROUP BY status
      `),
      pool.query(`
        SELECT status, COUNT(*)::int AS count
          FROM ekazi_bookings
         GROUP BY status
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE role = 'student')::int AS clients,
          COUNT(*) FILTER (WHERE role = 'tutor')::int AS handymen,
          COUNT(*) FILTER (WHERE phone IS NULL)::int AS missing_phone,
          COUNT(*) FILTER (WHERE account_status = 'banned')::int AS banned,
          COUNT(*) FILTER (WHERE suspended_until IS NOT NULL AND suspended_until > NOW())::int AS suspended
          FROM users
      `),
      pool.query(`
        SELECT r.id, r.document_type, r.document_url, r.status, r.updated_at,
               u.name, u.email, u.phone, hp.business_name
          FROM ekazi_handyman_verification_reviews r
          JOIN users u ON u.id = r.handyman_user_id
          LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = r.handyman_user_id
         WHERE r.status = 'pending'
         ORDER BY r.updated_at DESC
         LIMIT 8
      `),
      pool.query(`
        SELECT b.id, b.status, b.cancelled_by, b.cancellation_reason, b.cancellation_reason_code,
               b.cancellation_notes, b.cancelled_at, j.description, cu.name AS client_name,
               hu.name AS handyman_name
          FROM ekazi_bookings b
          JOIN ekazi_jobs j ON j.id = b.job_id
          JOIN users cu ON cu.id = b.client_user_id
          JOIN users hu ON hu.id = b.handyman_user_id
         WHERE b.status = 'cancelled'
         ORDER BY b.cancelled_at DESC NULLS LAST, b.created_at DESC
         LIMIT 8
      `),
    ]);

    const asMap = (rows) => Object.fromEntries(rows.map((row) => [row.status || 'unknown', Number(row.count || 0)]));
    return res.json({
      success: true,
      counts: {
        verifications: asMap(verifications.rows),
        jobs: asMap(jobs.rows),
        quotes: asMap(quotes.rows),
        bookings: asMap(bookings.rows),
        users: users.rows[0] || {},
      },
      queues: {
        pendingVerifications: recentDocs.rows,
        recentCancellations: recentCancellations.rows,
      },
    });
  } catch (error) {
    console.error('getAdminApprovalsOverview error:', error);
    return res.status(500).json({ success: false, message: 'Could not load approvals overview' });
  }
}

export async function listAdminMarketplaceJobs(req, res) {
  try {
    await ensureMarketplaceSchema();
    const status = String(req.query?.status || 'all');
    const params = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = 'WHERE j.status = $1';
    }
    const { rows } = await pool.query(`
      SELECT j.*, u.name AS client_name, u.email AS client_email, u.phone AS client_phone,
             COUNT(q.id)::int AS quote_count
        FROM ekazi_jobs j
        JOIN users u ON u.id = j.client_user_id
        LEFT JOIN ekazi_quotes q ON q.job_id = j.id
       ${where}
       GROUP BY j.id, u.id
       ORDER BY j.created_at DESC
       LIMIT 300
    `, params);
    return res.json({ success: true, jobs: rows });
  } catch (error) {
    console.error('listAdminMarketplaceJobs error:', error);
    return res.status(500).json({ success: false, message: 'Could not load marketplace jobs' });
  }
}

export async function listAdminMarketplaceBookings(req, res) {
  try {
    await ensureMarketplaceSchema();
    const status = String(req.query?.status || 'all');
    const params = [];
    let where = '';
    if (status !== 'all') {
      params.push(status);
      where = 'WHERE b.status = $1';
    }
    const { rows } = await pool.query(`
      SELECT b.*, j.description, j.estate, j.city,
             cu.name AS client_name, cu.email AS client_email, cu.phone AS client_phone,
             hu.name AS handyman_name, hu.email AS handyman_email, hu.phone AS handyman_phone,
             hp.business_name, hp.cancellation_score, hp.suspended_until
        FROM ekazi_bookings b
        JOIN ekazi_jobs j ON j.id = b.job_id
        JOIN users cu ON cu.id = b.client_user_id
        JOIN users hu ON hu.id = b.handyman_user_id
        LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = b.handyman_user_id
       ${where}
       ORDER BY COALESCE(b.cancelled_at, b.created_at) DESC
       LIMIT 300
    `, params);
    return res.json({ success: true, bookings: rows });
  } catch (error) {
    console.error('listAdminMarketplaceBookings error:', error);
    return res.status(500).json({ success: false, message: 'Could not load bookings' });
  }
}
