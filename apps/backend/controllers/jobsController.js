import pool from '../config/db.js';
import { ensureMarketplaceSchema, jobJson } from '../services/marketplaceStore.js';
import { normalizeProviderServices, providerServiceLimitError, validateProviderServiceSelection } from '../services/providerServiceLimit.js';
import { dispatchJobToNearestProviders } from '../services/marketplaceDispatchService.js';

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

const PROVIDER_DECLINE_REASONS = {
  schedule_conflict: { label: 'I am unavailable at that time', impact: 2 },
  too_far: { label: 'The job is too far from my service area', impact: 1 },
  not_my_skill: { label: 'This job is outside my skill set', impact: 0 },
  scope_unclear: { label: 'The job details are not clear enough', impact: 0 },
  budget_too_low: { label: 'The client budget is too low', impact: 1 },
  materials_issue: { label: 'Required materials are unavailable', impact: 1 },
  unsafe_or_uncomfortable: { label: 'The location or request feels unsafe', impact: 0 },
  emergency: { label: 'Emergency or illness', impact: 0 },
  not_interested: { label: 'I do not want this job', impact: 3 },
};

function normalizeProviderDecline(input) {
  const code = String(input?.reasonCode || input?.code || '').trim();
  const option = PROVIDER_DECLINE_REASONS[code];
  if (!option) return null;
  return {
    code,
    reason: option.label,
    impact: Number(option.impact || 0),
    notes: String(input?.notes || '').trim().slice(0, 500) || null,
  };
}

async function applyProviderDeclinePenalty(db, providerId, decline) {
  const { rows } = await db.query(
    `UPDATE ekazi_handyman_profiles
        SET provider_decline_count = COALESCE(provider_decline_count, 0) + 1,
            provider_decline_score = GREATEST(0, COALESCE(provider_decline_score, 100) - $2),
            cancellation_score = GREATEST(0, cancellation_score - $2),
            suspended_until = CASE
              WHEN GREATEST(0, COALESCE(provider_decline_score, 100) - $2) < 75 THEN NOW() + INTERVAL '1 day'
              ELSE suspended_until
            END,
            updated_at = NOW()
      WHERE user_id = $1
      RETURNING provider_decline_count, provider_decline_score, cancellation_score, suspended_until`,
    [providerId, decline.impact],
  );
  const profile = rows[0] || null;
  if (profile?.suspended_until && new Date(profile.suspended_until).getTime() > Date.now()) {
    await db.query(
      `UPDATE users
          SET account_status = 'suspended',
              suspended_until = $2,
              suspension_reason = $3
        WHERE id = $1`,
      [providerId, profile.suspended_until, 'Repeated provider quote-share declines: ' + decline.reason],
    );
  }
  return profile;
}

function isLocalUploadUrl(url) {
  return typeof url === 'string' && /\/uploads\//i.test(url);
}

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
      code: 'FIRST5',
      percent: 5,
      eligible,
      description: eligible
        ? '5% of labour is deducted when you accept a quote for your first job. Ekazi funds the discount.'
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
      `SELECT j.*,
              COUNT(q.id) FILTER (WHERE q.status = 'open') AS quote_count,
              b.id AS booking_id,
              b.quote_id AS booking_quote_id,
              b.status AS booking_status,
              b.client_rating AS booking_client_rating,
              b.client_review AS booking_client_review,
              b.client_reviewed_at AS booking_client_reviewed_at,
              b.completed_at AS booking_completed_at,
              b.cancelled_at AS booking_cancelled_at,
              hp.business_name AS booking_provider_business_name,
              hu.name AS booking_provider_name
         FROM ekazi_jobs j
         LEFT JOIN ekazi_quotes q ON q.job_id = j.id
         LEFT JOIN ekazi_bookings b ON b.job_id = j.id
         LEFT JOIN users hu ON hu.id = b.handyman_user_id
         LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = b.handyman_user_id
        WHERE ${where}
        GROUP BY j.id, b.id, hp.business_name, hu.name
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
    const discountCode = ['FIRST5', 'FIRST10'].includes(requestedCode) && eligible ? 'FIRST5' : null;
    const discountPercent = discountCode ? 5 : 0;
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
    let dispatch = { offered: [] };
    try {
      dispatch = await dispatchJobToNearestProviders(pool, rows[0].id, { reason: 'created', fanout: 3 });
    } catch (notifyError) {
      console.warn('[ekazi-dispatch] job_create_dispatch_failed', { jobId: rows[0].id, message: notifyError?.message });
    }
    return res.status(201).json({
      job: jobJson(rows[0]),
      promotionApplied: Boolean(discountCode),
      providersAlerted: dispatch.offered?.length || 0,
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
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_jobs SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1
          AND client_user_id = $2
          AND status IN ('active','quoted')
          AND NOT EXISTS (SELECT 1 FROM ekazi_bookings b WHERE b.job_id = ekazi_jobs.id)
        RETURNING *`,
      [req.params.id, id],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Request can no longer be deleted. Cancel the booking instead.' });
    }
    await client.query(
      `UPDATE ekazi_quotes
          SET status = 'cancelled', updated_at = NOW()
        WHERE job_id = $1 AND status = 'open'`,
      [rows[0].id],
    );
    await client.query(
      `UPDATE ekazi_job_dispatches
          SET status = 'cancelled', updated_at = NOW()
        WHERE job_id = $1 AND status IN ('offered','quoted')`,
      [rows[0].id],
    ).catch(() => undefined);
    await client.query('COMMIT');
    return res.json({ ok: true, job: jobJson(rows[0]) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('cancelJob error:', error);
    return res.status(500).json({ message: 'Could not delete request' });
  } finally {
    client.release();
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
                hm.service_radius_km,
                d.offer_rank AS dispatch_rank,
                d.notified_at AS dispatch_notified_at
           FROM ekazi_jobs j
           JOIN users u ON u.id = j.client_user_id
           CROSS JOIN hm
           LEFT JOIN ekazi_quotes q ON q.job_id = j.id
           LEFT JOIN ekazi_job_dispatches d ON d.job_id = j.id AND d.handyman_user_id = $1 AND d.status = 'offered'
          WHERE j.status IN ('active','quoted')
            AND u.phone IS NOT NULL
            AND j.client_user_id <> $1
            AND (cardinality(hm.categories) = 0 OR j.category_id = ANY(hm.categories) OR COALESCE(j.service_id, '') = ANY(hm.categories))
            AND NOT EXISTS (
              SELECT 1 FROM ekazi_quotes own
               WHERE own.job_id = j.id AND own.handyman_user_id = $1
            )
            AND NOT EXISTS (
              SELECT 1 FROM ekazi_job_dispatches declined
               WHERE declined.job_id = j.id
                 AND declined.handyman_user_id = $1
                 AND declined.status = 'declined'
            )
          GROUP BY j.id, u.name, u.phone, hm.latitude, hm.longitude, hm.service_radius_km, d.offer_rank, d.notified_at
       )
       SELECT * FROM candidates
        WHERE distance_km IS NULL OR distance_km <= service_radius_km
        ORDER BY CASE WHEN dispatch_rank IS NULL THEN 1 ELSE 0 END ASC, dispatch_rank ASC NULLS LAST, nearest_rank ASC, distance_km ASC NULLS LAST, created_at DESC
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

export const declineHandymanJobOffer = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const decline = normalizeProviderDecline(req.body);
    if (!decline) {
      return res.status(400).json({
        message: 'Choose a valid reason before declining this job.',
        reasons: Object.entries(PROVIDER_DECLINE_REASONS).map(([code, item]) => ({ code, label: item.label, impact: item.impact })),
      });
    }

    await client.query('BEGIN');
    const jobResult = await client.query(
      `SELECT id, client_user_id, status
         FROM ekazi_jobs
        WHERE id = $1
          AND status IN ('active','quoted')
          AND client_user_id <> $2
        FOR UPDATE`,
      [req.params.id, id],
    );
    const job = jobResult.rows[0];
    if (!job) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Open job not found.' });
    }
    const alreadyQuoted = await client.query(
      `SELECT 1 FROM ekazi_quotes WHERE job_id = $1 AND handyman_user_id = $2 LIMIT 1`,
      [job.id, id],
    );
    if (alreadyQuoted.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'You already sent a quote for this job.' });
    }
    await client.query(
      `INSERT INTO ekazi_job_dispatches (job_id, handyman_user_id, status, offer_rank, reason, responded_at, updated_at)
       VALUES ($1, $2, 'declined', 999, $3, NOW(), NOW())
       ON CONFLICT (job_id, handyman_user_id) DO UPDATE SET
         status = 'declined',
         reason = EXCLUDED.reason,
         responded_at = NOW(),
         updated_at = NOW()`,
      [job.id, id, decline.code],
    );
    const trust = await applyProviderDeclinePenalty(client, id, decline);
    await client.query('COMMIT');

    const dispatch = await dispatchJobToNearestProviders(pool, job.id, { reason: 'provider_declined', fanout: 1 }).catch((error) => {
      console.warn('[ekazi-dispatch] provider_decline_forward_failed', { jobId: job.id, message: error?.message });
      return { offered: [] };
    });
    return res.json({ ok: true, forwardedTo: dispatch.offered?.length || 0, trust });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('declineHandymanJobOffer error:', error);
    return res.status(500).json({ message: 'Could not decline this job offer' });
  } finally {
    client.release();
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
    const selectedServices = normalizeProviderServices(categories);
    if (!address || !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
      return res.status(400).json({ message: 'Address and map coordinates are required' });
    }
    const serviceLimit = await validateProviderServiceSelection(pool, id, selectedServices);
    if (!serviceLimit.ok) {
      return res.status(serviceLimit.status || 409).json(providerServiceLimitError(serviceLimit));
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
        selectedServices,
        String(address),
        estate || null,
        String(city),
        Number(latitude),
        Number(longitude),
      ],
    );
    if (!rows.length) return res.status(403).json({ message: 'Provider account required' });
    return res.json({ profile: rows[0] });
  } catch (error) {
    console.error('updateHandymanLocation error:', error);
    return res.status(500).json({ message: 'Could not save service location' });
  }
};


export const getHandymanEarnings = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const id = userId(req);
    if (!id) return res.status(401).json({ message: 'Unauthorized' });
    const summaryResult = await pool.query(
      `SELECT
          COALESCE(SUM(handyman_payout_amount), 0)::numeric AS net_total,
          COALESCE(SUM(organization_commission_amount), 0)::numeric AS platform_total,
          COALESCE(SUM(total), 0)::numeric AS gross_total,
          COUNT(*)::int AS completed_count,
          MAX(COALESCE(completed_at, created_at)) AS latest_at
         FROM ekazi_bookings
        WHERE handyman_user_id = $1 AND status = 'completed'`,
      [id],
    );
    const latestResult = await pool.query(
      `SELECT b.id, b.total, b.organization_commission_amount, b.handyman_payout_amount,
              COALESCE(b.completed_at, b.created_at) AS earned_at,
              j.service_name, j.category_name, j.estate, j.city
         FROM ekazi_bookings b
         JOIN ekazi_jobs j ON j.id = b.job_id
        WHERE b.handyman_user_id = $1 AND b.status = 'completed'
        ORDER BY COALESCE(b.completed_at, b.created_at) DESC
        LIMIT 5`,
      [id],
    );
    const periodQuery = async (bucket, interval, limit) => {
      const { rows } = await pool.query(
        `SELECT to_char(date_trunc($2::text, COALESCE(completed_at, created_at)), $3::text) AS label,
                COALESCE(SUM(handyman_payout_amount), 0)::numeric AS amount,
                COUNT(*)::int AS jobs
           FROM ekazi_bookings
          WHERE handyman_user_id = $1
            AND status = 'completed'
            AND COALESCE(completed_at, created_at) >= NOW() - ${interval}
          GROUP BY date_trunc($2::text, COALESCE(completed_at, created_at))
          ORDER BY date_trunc($2::text, COALESCE(completed_at, created_at)) ASC
          LIMIT $4::int`,
        [id, bucket, bucket === 'month' ? 'Mon YYYY' : bucket === 'week' ? '"W"IW' : 'DD Mon', limit],
      );
      return rows.map((row) => ({
        label: row.label,
        amount: Number(row.amount || 0),
        jobs: Number(row.jobs || 0),
      }));
    };
    const [daily, weekly, monthly] = await Promise.all([
      periodQuery('day', "INTERVAL '30 days'", 30),
      periodQuery('week', "INTERVAL '12 weeks'", 12),
      periodQuery('month', "INTERVAL '12 months'", 12),
    ]);
    const summary = summaryResult.rows[0] || {};
    return res.json({
      summary: {
        netTotal: Number(summary.net_total || 0),
        platformTotal: Number(summary.platform_total || 0),
        grossTotal: Number(summary.gross_total || 0),
        completedCount: Number(summary.completed_count || 0),
        latestAt: summary.latest_at || null,
      },
      latest: latestResult.rows.map((row) => ({
        bookingId: String(row.id),
        serviceName: row.service_name || row.category_name || 'Ekazi job',
        location: [row.estate, row.city].filter(Boolean).join(', '),
        gross: Number(row.total || 0),
        platformFee: Number(row.organization_commission_amount || 0),
        payout: Number(row.handyman_payout_amount || 0),
        earnedAt: row.earned_at,
      })),
      history: { daily, weekly, monthly },
    });
  } catch (error) {
    console.error('getHandymanEarnings error:', error);
    return res.status(500).json({ message: 'Could not load provider earnings' });
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
    return res.status(500).json({ message: 'Could not load provider profile' });
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
    if (isLocalUploadUrl(documentUrl)) {
      return res.status(400).json({
        message: 'This document was saved to local /uploads instead of Ekazi public storage. Please upload it again.',
      });
    }
    const patch = verificationPatch(documentType, documentUrl);
    const roleResult = await pool.query('SELECT id, name, role FROM users WHERE id = $1', [id]);
    const user = roleResult.rows[0];
    if (user?.role !== 'tutor') return res.status(403).json({ message: 'Provider account required' });
    await pool.query(
      `INSERT INTO ekazi_handyman_profiles (user_id, business_name, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [id, user.name || 'Ekazi Provider'],
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

