import pool from '../config/db.js';
import { ensureMarketplaceSchema, jobJson } from '../services/marketplaceStore.js';

const validStatuses = new Set([
  'active',
  'quoted',
  'booked',
  'in_progress',
  'completed',
  'cancelled',
]);

function userId(req) {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const verificationTypes = new Set(['profile_image', 'id_document', 'certificate', 'good_conduct']);

function verificationPatch(documentType, url) {
  if (documentType === 'profile_image') return { column: 'profile_image_url', statusColumn: 'profile_image_status', url };
  if (documentType === 'id_document') return { column: 'id_document_url', statusColumn: 'id_document_status', url };
  if (documentType === 'certificate') return { column: 'certificate_url', statusColumn: 'certificate_status', url };
  if (documentType === 'good_conduct') return { column: 'good_conduct_url', statusColumn: 'good_conduct_status', url };
  return null;
}

async function recalculateHandymanVerification(db, handymanId) {
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
    [handymanId],
  );
  return rows[0] || null;
}

function handymanVerificationJson(profile) {
  return profile && {
    profileImageUrl: profile.profile_image_url || null,
    profileImageStatus: profile.profile_image_status || 'missing',
    idDocumentUrl: profile.id_document_url || null,
    idDocumentStatus: profile.id_document_status || 'missing',
    certificateUrl: profile.certificate_url || null,
    certificateStatus: profile.certificate_status || 'missing',
    goodConductUrl: profile.good_conduct_url || null,
    goodConductStatus: profile.good_conduct_status || 'missing',
    verified: Boolean(profile.verified),
    fullyVerified: Boolean(profile.verified && profile.certificate_status === 'approved' && profile.good_conduct_status === 'approved'),
    status: profile.verification_status || (profile.verified ? 'active' : 'incomplete'),
    required: {
      profileImage: profile.profile_image_status === 'approved',
      identityCard: profile.id_document_status === 'approved',
    },
  };
}


async function requireActiveUserContact(db, id, actorLabel) {
  const { rows } = await db.query(
    `SELECT id, phone, account_status, suspended_until
       FROM users
      WHERE id = $1`,
    [id],
  );
  const user = rows[0];
  if (!user) return { ok: false, status: 401, message: 'Account not found' };
  if (user.account_status === 'banned') {
    return { ok: false, status: 403, message: 'This account has been banned. Contact Ekazi support.' };
  }
  if (user.suspended_until && new Date(user.suspended_until).getTime() > Date.now()) {
    return { ok: false, status: 403, message: 'This account is temporarily suspended. Try again after the suspension period.' };
  }
  if (!user.phone) {
    return { ok: false, status: 400, message: `${actorLabel} must add a valid Kenyan phone number before using marketplace jobs.` };
  }
  return { ok: true, user };
}

async function firstJobEligibility(db, id, excludeJobId = null) {
  const { rows } = await db.query(
    `SELECT NOT EXISTS (
       SELECT 1 FROM ekazi_jobs
        WHERE client_user_id = $1
          AND status <> 'cancelled'
          AND ($2::bigint IS NULL OR id <> $2)
     ) AS eligible`,
    [id, excludeJobId],
  );
  return Boolean(rows[0]?.eligible);
}

export const getFirstJobPromotion = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const eligible = await firstJobEligibility(pool, id);
    return res.json({
      code: 'FIRST10',
      percent: 10,
      eligible,
      description: eligible
        ? '10% is deducted when you accept a quote for your first job.'
        : 'This offer has already been used.',
    });
  } catch (error) {
    console.error('getFirstJobPromotion error:', error);
    return res.status(500).json({ message: 'Could not load promotion' });
  }
};

export const listJobs = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const status = String(req.query.status || 'active');
    const params = [id];
    let where = 'j.client_user_id = $1';
    if (status === 'active') {
      where += ` AND j.status IN ('active','quoted','booked','in_progress')`;
    } else if (validStatuses.has(status)) {
      params.push(status);
      where += ' AND j.status = $2';
    }
    const { rows } = await pool.query(
      `SELECT j.*, COUNT(q.id) FILTER (WHERE q.status = 'open') AS quote_count
         FROM ekazi_jobs j
         LEFT JOIN ekazi_quotes q ON q.job_id = j.id
        WHERE ${where}
        GROUP BY j.id
        ORDER BY j.created_at DESC`,
      params,
    );
    return res.json({ jobs: rows.map(jobJson) });
  } catch (error) {
    console.error('listJobs error:', error);
    return res.status(500).json({ message: 'Could not load jobs' });
  }
};

export const getJob = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    const { rows } = await pool.query(
      `SELECT j.*, COUNT(q.id) FILTER (WHERE q.status = 'open') AS quote_count
         FROM ekazi_jobs j
         LEFT JOIN ekazi_quotes q ON q.job_id = j.id
        WHERE j.id = $1 AND j.client_user_id = $2
        GROUP BY j.id`,
      [req.params.id, id],
    );
    if (!rows.length) return res.status(404).json({ message: 'Job not found' });
    return res.json({ job: jobJson(rows[0]) });
  } catch (error) {
    console.error('getJob error:', error);
    return res.status(500).json({ message: 'Could not load job' });
  }
};

export const createJob = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const contactCheck = await requireActiveUserContact(client, id, 'Client');
    if (!contactCheck.ok) {
      return res.status(contactCheck.status).json({ message: contactCheck.message });
    }
    const body = req.body || {};
    for (const key of ['categoryId', 'description', 'estate', 'city', 'scheduleType']) {
      if (!body[key]) return res.status(400).json({ message: `${key} is required` });
    }

    await client.query('BEGIN');
    const eligible = await firstJobEligibility(client, id);
    const requestedCode = String(body.discountCode || '').trim().toUpperCase();
    const discountCode = requestedCode === 'FIRST10' && eligible ? 'FIRST10' : null;
    const discountPercent = discountCode ? 10 : 0;
    const { rows } = await client.query(
      `INSERT INTO ekazi_jobs (
        client_user_id, category_id, category_name, service_id, service_name,
        description, photo_urls, estate, city, address, latitude, longitude,
        schedule_type, scheduled_for, flexible_schedule, budget_min, budget_max,
        provider_brings_materials, notes, discount_code, discount_percent
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21
      ) RETURNING *`,
      [
        id,
        String(body.categoryId),
        body.categoryName || null,
        body.serviceId ? String(body.serviceId) : null,
        body.serviceName || null,
        String(body.description).trim(),
        Array.isArray(body.photoUrls) ? body.photoUrls.map(String).slice(0, 6) : [],
        String(body.estate),
        String(body.city),
        body.address || null,
        Number.isFinite(Number(body.latitude)) ? Number(body.latitude) : null,
        Number.isFinite(Number(body.longitude)) ? Number(body.longitude) : null,
        String(body.scheduleType),
        body.scheduledFor || null,
        Boolean(body.flexibleSchedule),
        body.budgetMin == null ? null : Number(body.budgetMin),
        body.budgetMax == null ? null : Number(body.budgetMax),
        Boolean(body.providerBringsMaterials),
        body.notes || null,
        discountCode,
        discountPercent,
      ],
    );
    await client.query('COMMIT');
    return res.status(201).json({
      job: jobJson(rows[0]),
      promotionApplied: Boolean(discountCode),
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('createJob error:', error);
    return res.status(500).json({ message: 'Could not create job' });
  } finally {
    client.release();
  }
};

export const updateJob = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    const { rows } = await pool.query(
      `UPDATE ekazi_jobs SET
         description = COALESCE($3, description),
         notes = COALESCE($4, notes),
         updated_at = NOW()
       WHERE id = $1 AND client_user_id = $2 AND status = 'active'
       RETURNING *`,
      [req.params.id, id, req.body?.description || null, req.body?.notes ?? null],
    );
    if (!rows.length) return res.status(404).json({ message: 'Editable job not found' });
    return res.json({ job: jobJson(rows[0]) });
  } catch (error) {
    console.error('updateJob error:', error);
    return res.status(500).json({ message: 'Could not update job' });
  }
};

export const addJobPhotos = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    const photoUrls = Array.isArray(req.body?.photoUrls)
      ? req.body.photoUrls.map(String)
      : null;
    if (!photoUrls) return res.status(400).json({ message: 'photoUrls must be an array' });
    const { rows } = await pool.query(
      `UPDATE ekazi_jobs
          SET photo_urls = (photo_urls || $3::text[])[1:6], updated_at = NOW()
        WHERE id = $1 AND client_user_id = $2
        RETURNING *`,
      [req.params.id, id, photoUrls],
    );
    if (!rows.length) return res.status(404).json({ message: 'Job not found' });
    return res.json({ job: jobJson(rows[0]) });
  } catch (error) {
    console.error('addJobPhotos error:', error);
    return res.status(500).json({ message: 'Could not add photos' });
  }
};

export const cancelJob = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    const { rows } = await pool.query(
      `UPDATE ekazi_jobs SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND client_user_id = $2 AND status IN ('active','quoted')
        RETURNING *`,
      [req.params.id, id],
    );
    if (!rows.length) {
      return res.status(409).json({ message: 'Job can no longer be cancelled' });
    }
    return res.json({ ok: true, job: jobJson(rows[0]) });
  } catch (error) {
    console.error('cancelJob error:', error);
    return res.status(500).json({ message: 'Could not cancel job' });
  }
};

export const listOpenJobsForHandyman = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const profileResult = await pool.query('SELECT * FROM ekazi_handyman_profiles WHERE user_id = $1', [id]);
    const profile = await recalculateHandymanVerification(pool, id) || profileResult.rows[0] || null;
    const verification = handymanVerificationJson(profile);
    if (!profile?.verified) {
      return res.json({
        jobs: [],
        verification,
        blocked: true,
        message: 'Upload and get approval for your profile photo and national ID before receiving nearby jobs.',
      });
    }
    const { rows } = await pool.query(
      `WITH hm AS (
         SELECT * FROM ekazi_handyman_profiles WHERE user_id = $1
       ), candidates AS (
         SELECT j.*, u.name AS client_name, u.phone AS client_phone,
                COUNT(q.id) FILTER (WHERE q.status = 'open') AS quote_count,
                CASE
                  WHEN hm.latitude IS NOT NULL AND hm.longitude IS NOT NULL AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL THEN
                    6371 * acos(LEAST(1, GREATEST(-1,
                      cos(radians(hm.latitude)) * cos(radians(j.latitude)) * cos(radians(j.longitude) - radians(hm.longitude)) +
                      sin(radians(hm.latitude)) * sin(radians(j.latitude))
                    )))
                  ELSE NULL
                END AS distance_km,
                CASE WHEN hm.latitude IS NOT NULL AND hm.longitude IS NOT NULL AND j.latitude IS NOT NULL AND j.longitude IS NOT NULL THEN 0 ELSE 1 END AS nearest_rank,
                hm.service_radius_km
           FROM ekazi_jobs j
           JOIN users u ON u.id = j.client_user_id
           CROSS JOIN hm
           LEFT JOIN ekazi_quotes q ON q.job_id = j.id
          WHERE j.status IN ('active','quoted')
            AND u.phone IS NOT NULL
            AND j.client_user_id <> $1
            AND (cardinality(hm.categories) = 0 OR j.category_id = ANY(hm.categories) OR COALESCE(j.service_id, '') = ANY(hm.categories))
            AND NOT EXISTS (
              SELECT 1 FROM ekazi_quotes own
               WHERE own.job_id = j.id AND own.handyman_user_id = $1
            )
          GROUP BY j.id, u.name, u.phone, hm.latitude, hm.longitude, hm.service_radius_km
       )
       SELECT * FROM candidates
        WHERE distance_km IS NULL OR distance_km <= service_radius_km
        ORDER BY nearest_rank ASC, distance_km ASC NULLS LAST, created_at DESC
        LIMIT 100`,
      [id],
    );
    return res.json({
      verification,
      jobs: rows.map((row) => ({
        ...jobJson(row),
        client: {
          name: row.client_name,
          phone: row.client_phone,
        },
      })),
    });
  } catch (error) {
    console.error('listOpenJobsForHandyman error:', error);
    return res.status(500).json({ message: 'Could not load available jobs' });
  }
};

export const updateHandymanLocation = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    const {
      address,
      estate,
      city = 'Nairobi',
      latitude,
      longitude,
      categories = [],
    } = req.body || {};
    if (!address || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return res.status(400).json({ message: 'Address and map coordinates are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO ekazi_handyman_profiles
         (user_id, business_name, categories, address, estate, city, latitude, longitude, updated_at)
       SELECT u.id, u.name, $2, $3, $4, $5, $6, $7, NOW()
         FROM users u WHERE u.id = $1 AND u.role = 'tutor'
       ON CONFLICT (user_id) DO UPDATE SET
         categories = CASE WHEN cardinality(EXCLUDED.categories) > 0
                           THEN EXCLUDED.categories ELSE ekazi_handyman_profiles.categories END,
         address = EXCLUDED.address, estate = EXCLUDED.estate, city = EXCLUDED.city,
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, updated_at = NOW()
       RETURNING *`,
      [
        id,
        categories.map(String),
        String(address),
        estate || null,
        String(city),
        Number(latitude),
        Number(longitude),
      ],
    );
    if (!rows.length) return res.status(403).json({ message: 'Handyman account required' });
    return res.json({ profile: rows[0] });
  } catch (error) {
    console.error('updateHandymanLocation error:', error);
    return res.status(500).json({ message: 'Could not save service location' });
  }
};

export const getHandymanProfile = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const { rows } = await pool.query(
      'SELECT * FROM ekazi_handyman_profiles WHERE user_id = $1',
      [userId(req)],
    );
    const profile = rows[0] ? await recalculateHandymanVerification(pool, userId(req)) : null;
    return res.json({ profile, verification: handymanVerificationJson(profile) });
  } catch (error) {
    console.error('getHandymanProfile error:', error);
    return res.status(500).json({ message: 'Could not load handyman profile' });
  }
};


export const updateHandymanVerificationDocuments = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const documentType = String(req.body?.documentType || '').trim();
    const documentUrl = String(req.body?.url || '').trim();
    if (!verificationTypes.has(documentType)) {
      return res.status(400).json({ message: 'Unsupported verification document type' });
    }
    if (!/^https?:\/\//i.test(documentUrl)) {
      return res.status(400).json({ message: 'A valid uploaded document URL is required' });
    }
    const patch = verificationPatch(documentType, documentUrl);
    const roleResult = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
    const user = roleResult.rows[0];
    if (user?.role !== 'tutor') return res.status(403).json({ message: 'Handyman account required' });
    await pool.query(
      `INSERT INTO ekazi_handyman_profiles (user_id, business_name, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [id, user.name || 'Ekazi Handyman'],
    );
    await pool.query(
      `UPDATE ekazi_handyman_profiles
          SET ${patch.column} = $2,
              ${patch.statusColumn} = 'pending',
              verified = FALSE,
              verification_status = 'pending_review',
              updated_at = NOW()
        WHERE user_id = $1`,
      [id, documentUrl],
    );
    await pool.query(
      `INSERT INTO ekazi_handyman_verification_reviews (handyman_user_id, document_type, document_url, status, updated_at)
       VALUES ($1,$2,$3,'pending',NOW())
       ON CONFLICT (handyman_user_id, document_type) DO UPDATE SET
         document_url = EXCLUDED.document_url,
         status = 'pending',
         notes = NULL,
         reviewed_by = NULL,
         reviewed_at = NULL,
         updated_at = NOW()`,
      [id, documentType, documentUrl],
    );
    const { rows } = await pool.query('SELECT * FROM ekazi_handyman_profiles WHERE user_id = $1', [id]);
    return res.json({ profile: rows[0], verification: handymanVerificationJson(rows[0]) });
  } catch (error) {
    console.error('updateHandymanVerificationDocuments error:', error);
    return res.status(500).json({ message: 'Could not save verification document' });
  }
};
