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
    const { rows } = await pool.query(
      `SELECT j.*, COUNT(q.id) FILTER (WHERE q.status = 'open') AS quote_count
         FROM ekazi_jobs j
         LEFT JOIN ekazi_quotes q ON q.job_id = j.id
        WHERE j.status IN ('active','quoted')
          AND j.client_user_id <> $1
          AND NOT EXISTS (
            SELECT 1 FROM ekazi_quotes own
             WHERE own.job_id = j.id AND own.handyman_user_id = $1
          )
        GROUP BY j.id
        ORDER BY j.created_at DESC
        LIMIT 100`,
      [id],
    );
    return res.json({
      jobs: rows.map((row) => ({
        ...jobJson(row),
        address: null,
        latitude: null,
        longitude: null,
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
    return res.json({ profile: rows[0] || null });
  } catch (error) {
    console.error('getHandymanProfile error:', error);
    return res.status(500).json({ message: 'Could not load handyman profile' });
  }
};
