import pool from '../config/db.js';
import { ensureMarketplaceSchema, quoteJson } from '../services/marketplaceStore.js';
import {
  CASH_COMMISSION_BLOCK_THRESHOLD,
  assertCashBookingAllowed,
  providerCommissionDue,
  recordBookingSettlement,
} from '../services/marketplaceSettlementService.js';
import {
  dispatchJobToNearestProviders,
  forwardJobAfterQuoteDecline,
  notifyBookingLifecycle,
  notifyQuoteSubmitted,
} from '../services/marketplaceDispatchService.js';

function userId(req) {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const COMMISSION_PERCENT = 10;

const CLIENT_ISSUE_REASONS = {
  client_unreachable: { label: 'Client was unreachable', impact: 5, severe: false },
  scope_changed: { label: 'Client changed the scope after acceptance', impact: 8, severe: false },
  payment_pressure: { label: 'Client pressured me to bypass Ekazi or payment rules', impact: 12, severe: false },
  unsafe_site: { label: 'The work site felt unsafe', impact: 12, severe: false },
  disrespectful: { label: 'Client was disrespectful or abusive', impact: 15, severe: false },
  harassment: { label: 'Harassment or threatening behaviour', impact: 30, severe: true },
  fraud: { label: 'Fraud, fake request, or gross misconduct', impact: 40, severe: true },
};

function normalizeClientIssue(input) {
  const code = String(input?.reasonCode || input?.code || '').trim();
  const option = CLIENT_ISSUE_REASONS[code];
  if (!option) return null;
  return {
    code,
    reason: option.label,
    impact: Number(option.impact || 0),
    severe: Boolean(option.severe),
    notes: String(input?.notes || '').trim().slice(0, 700) || null,
  };
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function haversineKm(a, b) {
  const lat1 = toFiniteNumber(a?.latitude);
  const lon1 = toFiniteNumber(a?.longitude);
  const lat2 = toFiniteNumber(b?.latitude);
  const lon2 = toFiniteNumber(b?.longitude);
  if ([lat1, lon1, lat2, lon2].some((value) => value == null)) return null;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function routeEtaMinutes(distanceKm) {
  if (!Number.isFinite(distanceKm)) return null;
  const urbanAverageKph = 24;
  return Math.max(2, Math.ceil((distanceKm / urbanAverageKph) * 60));
}

function bookingRouteJson(row) {
  const destination = {
    latitude: toFiniteNumber(row.latitude),
    longitude: toFiniteNumber(row.longitude),
    label: row.address || [row.estate, row.city].filter(Boolean).join(', '),
  };
  const handymanLocation = {
    latitude: toFiniteNumber(row.handyman_latitude),
    longitude: toFiniteNumber(row.handyman_longitude),
    accuracy: toFiniteNumber(row.handyman_location_accuracy),
    updatedAt: row.handyman_location_updated_at || null,
  };
  const hasDestination = destination.latitude != null && destination.longitude != null;
  const hasHandyman = handymanLocation.latitude != null && handymanLocation.longitude != null;
  const updatedMs = handymanLocation.updatedAt ? new Date(handymanLocation.updatedAt).getTime() : 0;
  const isFresh = hasHandyman && updatedMs > 0 && Date.now() - updatedMs < 30 * 60 * 1000;
  const distanceKm = hasDestination && hasHandyman ? haversineKm(handymanLocation, destination) : null;
  const liveEtaMinutes = distanceKm == null ? null : routeEtaMinutes(distanceKm);
  return {
    available: Boolean(hasDestination),
    live: Boolean(isFresh && liveEtaMinutes != null),
    status: !hasDestination ? 'missing_destination' : isFresh ? 'live' : hasHandyman ? 'stale' : 'waiting_for_handyman',
    source: isFresh ? 'live_location' : 'quoted_eta',
    distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
    etaMinutes: isFresh && liveEtaMinutes != null ? liveEtaMinutes : row.eta_minutes || null,
    quotedEtaMinutes: row.eta_minutes || null,
    handymanLocation: hasHandyman ? handymanLocation : null,
    destination: hasDestination ? destination : null,
    polyline: hasDestination && hasHandyman ? [handymanLocation, destination] : [],
  };
}

const quoteSelect = `
  SELECT q.*, u.name AS handyman_name, u.phone AS handyman_phone,
         hp.business_name, hp.rating_avg, hp.rating_count,
         hp.verified, hp.profile_image_url, hp.profile_image_status, hp.id_document_status,
         hp.certificate_status, hp.good_conduct_status, hp.verification_status,
         hp.jobs_completed, hp.cancellation_score, hp.suspended_until,
         COALESCE((
           SELECT jsonb_agg(review_row ORDER BY reviewed_at DESC NULLS LAST)
             FROM (
               SELECT jsonb_build_object(
                        'rating', b.client_rating,
                        'comment', b.client_review,
                        'reviewedAt', b.client_reviewed_at
                      ) AS review_row,
                      b.client_reviewed_at AS reviewed_at
                 FROM ekazi_bookings b
                WHERE b.handyman_user_id = q.handyman_user_id
                  AND b.client_rating IS NOT NULL
                  AND NULLIF(BTRIM(COALESCE(b.client_review, '')), '') IS NOT NULL
                ORDER BY b.client_reviewed_at DESC NULLS LAST, b.id DESC
                LIMIT 3
             ) recent_provider_reviews
         ), '[]'::jsonb) AS provider_reviews
    FROM ekazi_quotes q
    JOIN users u ON u.id = q.handyman_user_id
    LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = q.handyman_user_id
`;

function normalizeCancellation(input) {
  const reason = String(input?.reason || '').trim();
  const code = String(input?.reasonCode || input?.code || '').trim();
  const notes = String(input?.notes || '').trim();
  if (!reason) return null;
  return {
    reason: reason.slice(0, 240),
    code: code.slice(0, 80) || null,
    notes: notes.slice(0, 500) || null,
  };
}

async function requireActiveVerifiedHandyman(db, id) {
  const { rows } = await db.query(
    `SELECT u.id, u.phone, u.account_status, u.suspended_until,
            hp.verified, hp.profile_image_status, hp.id_document_status, hp.verification_status
       FROM users u
       LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = u.id
      WHERE u.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return { ok: false, status: 401, message: 'Account not found' };
  if (row.account_status === 'banned') return { ok: false, status: 403, message: 'This account has been banned. Contact Ekazi support.' };
  if (row.suspended_until && new Date(row.suspended_until).getTime() > Date.now()) {
    return { ok: false, status: 403, message: 'This account is temporarily suspended. Try again after the suspension period.' };
  }
  if (!row.phone) return { ok: false, status: 400, message: 'Provider must add a valid Kenyan phone number before continuing.' };
  if (!row.verified || row.profile_image_status !== 'approved' || row.id_document_status !== 'approved') {
    return { ok: false, status: 403, message: 'Your Ekazi provider account must have an approved profile photo and national ID before receiving or sending quotes.' };
  }
  return { ok: true, user: row };
}

async function requireActiveContact(db, id, actorLabel) {
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
    return { ok: false, status: 400, message: `${actorLabel} must add a valid Kenyan phone number before continuing.` };
  }
  return { ok: true, user };
}

async function applyCancellationTrustPenalty(db, actor, userId, reason) {
  if (actor === 'handyman') {
    const { rows } = await db.query(
      `UPDATE ekazi_handyman_profiles
          SET cancellation_count = cancellation_count + 1,
              cancellation_score = GREATEST(0, cancellation_score - 10),
              suspended_until = CASE
                WHEN GREATEST(0, cancellation_score - 10) < 75 THEN NOW() + INTERVAL '1 day'
                ELSE suspended_until
              END,
              updated_at = NOW()
        WHERE user_id = $1
        RETURNING cancellation_score, suspended_until`,
      [userId],
    );
    const profile = rows[0];
    if (profile?.suspended_until && new Date(profile.suspended_until).getTime() > Date.now()) {
      await db.query(
        `UPDATE users
            SET account_status = 'suspended',
                suspended_until = $2,
                suspension_reason = $3
          WHERE id = $1`,
        [userId, profile.suspended_until, `Repeated provider cancellations: ${reason.reason}`],
      );
    }
    return profile || null;
  }

  const severe = ['client_abuse', 'client_fraud', 'client_harassment'].includes(String(reason.code || '').toLowerCase());
  const { rows } = await db.query(
    `UPDATE users
        SET trust_warning_count = trust_warning_count + 1,
            account_status = CASE
              WHEN $2::boolean THEN 'banned'
              WHEN trust_warning_count + 1 >= 3 THEN 'suspended'
              ELSE account_status
            END,
            suspended_until = CASE
              WHEN $2::boolean THEN suspended_until
              WHEN trust_warning_count + 1 >= 3 THEN NOW() + INTERVAL '1 day'
              ELSE suspended_until
            END,
            suspension_reason = CASE
              WHEN $2::boolean THEN $3
              WHEN trust_warning_count + 1 >= 3 THEN $3
              ELSE suspension_reason
            END
      WHERE id = $1
      RETURNING trust_warning_count, account_status, suspended_until`,
    [userId, severe, `Client cancellation/trust issue: ${reason.reason}`],
  );
  return rows[0] || null;
}

export const submitQuote = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const handymanId = userId(req);
    const {
      labor = 0,
      materials = 0,
      transport = 0,
      message,
      etaMinutes,
      durationHours,
    } = req.body || {};
    const amounts = [labor, materials, transport].map(Number);
    if (amounts.some((value) => !Number.isFinite(value) || value < 0)) {
      return res.status(400).json({ message: 'Quote amounts must be valid positive numbers' });
    }
    const subtotal = amounts.reduce((sum, value) => sum + value, 0);
    if (subtotal <= 0) {
      return res.status(400).json({ message: 'Quote total must be greater than zero' });
    }

    const contactCheck = await requireActiveVerifiedHandyman(pool, handymanId);
    if (!contactCheck.ok) {
      return res.status(contactCheck.status).json({ message: contactCheck.message });
    }
    const roleResult = await pool.query('SELECT role FROM users WHERE id = $1', [handymanId]);
    if (roleResult.rows[0]?.role !== 'tutor') {
      return res.status(403).json({ message: 'Only provider accounts can submit quotes' });
    }
    const jobResult = await pool.query(
      `SELECT j.*, u.phone AS client_phone
         FROM ekazi_jobs j
         JOIN users u ON u.id = j.client_user_id
        WHERE j.id = $1 AND j.status IN ('active','quoted') AND j.client_user_id <> $2`,
      [req.params.id, handymanId],
    );
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ message: 'Open job not found' });
    if (!job.client_phone) {
      return res.status(409).json({ message: 'Client must add a phone number before providers can quote this job' });
    }

    const discountAmount = Math.round((amounts[0] * Number(job.discount_percent || 0)) / 100);
    const total = subtotal - discountAmount;
    const { rows } = await pool.query(
      `INSERT INTO ekazi_quotes (
         job_id, handyman_user_id, labor, materials, transport, subtotal,
         discount_amount, total, message, eta_minutes, duration_hours
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (job_id, handyman_user_id) DO UPDATE SET
         labor = EXCLUDED.labor, materials = EXCLUDED.materials,
         transport = EXCLUDED.transport, subtotal = EXCLUDED.subtotal,
         discount_amount = EXCLUDED.discount_amount, total = EXCLUDED.total,
         message = EXCLUDED.message, eta_minutes = EXCLUDED.eta_minutes,
         duration_hours = EXCLUDED.duration_hours, status = 'open', updated_at = NOW()
       WHERE ekazi_quotes.status = 'open'
         AND NOT EXISTS (SELECT 1 FROM ekazi_bookings b WHERE b.quote_id = ekazi_quotes.id)
       RETURNING *`,
      [
        job.id,
        handymanId,
        amounts[0],
        amounts[1],
        amounts[2],
        subtotal,
        discountAmount,
        total,
        message || null,
        Number(etaMinutes) || null,
        Number(durationHours) || null,
      ],
    );
    if (!rows.length) {
      return res.status(409).json({ message: 'This quote can no longer be edited because the client has already acted on it.' });
    }
    const wasQuoteUpdate = rows[0]?.created_at && rows[0]?.updated_at
      ? new Date(rows[0].updated_at).getTime() - new Date(rows[0].created_at).getTime() > 1000
      : false;
    await pool.query(
      `UPDATE ekazi_job_dispatches
          SET status = 'quoted', responded_at = COALESCE(responded_at, NOW()), updated_at = NOW()
        WHERE job_id = $1 AND handyman_user_id = $2`,
      [job.id, handymanId],
    ).catch(() => undefined);
    await pool.query(
      `UPDATE ekazi_jobs SET status = 'quoted', updated_at = NOW()
        WHERE id = $1 AND status = 'active'`,
      [job.id],
    );
    notifyQuoteSubmitted(pool, rows[0].id, { updated: wasQuoteUpdate }).catch((notifyError) => {
      console.warn('[ekazi-notify] quote_submit_failed', { quoteId: rows[0].id, message: notifyError?.message });
    });
    return res.status(201).json({
      quote: quoteJson({ ...rows[0], handyman_user_id: handymanId }),
    });
  } catch (error) {
    console.error('submitQuote error:', error);
    return res.status(500).json({ message: 'Could not submit quote' });
  }
};

export const listQuotesForJob = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const ownership = await pool.query(
      'SELECT 1 FROM ekazi_jobs WHERE id = $1 AND client_user_id = $2',
      [req.params.id, userId(req)],
    );
    if (!ownership.rows.length) return res.status(404).json({ message: 'Job not found' });
    const { rows } = await pool.query(
      `${quoteSelect}
       WHERE q.job_id = $1 AND q.status = 'open'
       ORDER BY q.total, q.created_at`,
      [req.params.id],
    );
    return res.json({ quotes: rows.map(quoteJson) });
  } catch (error) {
    console.error('listQuotesForJob error:', error);
    return res.status(500).json({ message: 'Could not load quotes' });
  }
};

export const getQuote = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const { rows } = await pool.query(
      `${quoteSelect}
       JOIN ekazi_jobs j ON j.id = q.job_id
       WHERE q.id = $1 AND (j.client_user_id = $2 OR q.handyman_user_id = $2)`,
      [req.params.id, userId(req)],
    );
    if (!rows.length) return res.status(404).json({ message: 'Quote not found' });
    return res.json({ quote: quoteJson(rows[0]) });
  } catch (error) {
    console.error('getQuote error:', error);
    return res.status(500).json({ message: 'Could not load quote' });
  }
};

export const listHandymanQuotes = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const { rows } = await pool.query(
      `${quoteSelect.replace('SELECT q.*', 'SELECT q.*, b.id AS booking_id, b.status AS booking_status, j.description AS job_description, j.estate AS job_estate, j.city AS job_city, j.status AS job_status')}
       JOIN ekazi_jobs j ON j.id = q.job_id
       LEFT JOIN ekazi_bookings b ON b.quote_id = q.id
       WHERE q.handyman_user_id = $1
       ORDER BY q.created_at DESC`,
      [userId(req)],
    );
    return res.json({
      quotes: rows.map((row) => ({
        ...quoteJson(row),
        job: {
          description: row.job_description,
          estate: row.job_estate,
          city: row.job_city,
          status: row.job_status,
        },
        booking: row.booking_id ? {
          id: String(row.booking_id),
          status: row.booking_status,
        } : null,
      })),
    });
  } catch (error) {
    console.error('listHandymanQuotes error:', error);
    return res.status(500).json({ message: 'Could not load your quotes' });
  }
};

export const acceptQuote = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const clientId = userId(req);
    const paymentMethod = String(req.body?.paymentMethod || req.body?.payment_method || 'cash').toLowerCase() === 'card' ? 'card' : 'cash';
    await client.query('BEGIN');
    const clientContact = await requireActiveContact(client, clientId, 'Client');
    if (!clientContact.ok) {
      await client.query('ROLLBACK');
      return res.status(clientContact.status).json({ message: clientContact.message });
    }
    const result = await client.query(
      `SELECT q.*, j.client_user_id, j.status AS job_status, cu.phone AS client_phone, hu.phone AS handyman_phone,
              hp.verified AS handyman_verified, hp.profile_image_status, hp.id_document_status
         FROM ekazi_quotes q
         JOIN ekazi_jobs j ON j.id = q.job_id
         JOIN users cu ON cu.id = j.client_user_id
         JOIN users hu ON hu.id = q.handyman_user_id
         LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = q.handyman_user_id
        WHERE q.id = $1 AND j.client_user_id = $2
        FOR UPDATE OF q, j`,
      [req.params.id, clientId],
    );
    const quote = result.rows[0];
    if (!quote) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quote not found' });
    }
    if (!quote.client_phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Add a valid phone number before accepting a quote so the provider can contact you.' });
    }
    if (!quote.handyman_phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This provider must add a phone number before their quote can be accepted.' });
    }
    if (!quote.handyman_verified || quote.profile_image_status !== 'approved' || quote.id_document_status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This provider is not yet approved by Ekazi for client bookings.' });
    }
    if (!['active', 'quoted'].includes(quote.job_status) || quote.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This quote is no longer available' });
    }
    if (paymentMethod === 'cash') {
      try {
        await assertCashBookingAllowed(client, quote.handyman_user_id);
      } catch (error) {
        await client.query('ROLLBACK');
        return res.status(error.statusCode || 409).json({
          message: error.message,
          code: error.code || 'PROVIDER_CASH_BLOCKED',
          commissionDue: error.commissionDue,
          threshold: CASH_COMMISSION_BLOCK_THRESHOLD,
          cardAllowed: true,
        });
      }
    }

    await client.query(
      `UPDATE ekazi_quotes
          SET status = CASE WHEN id = $2 THEN 'accepted' ELSE 'closed' END,
              updated_at = NOW()
        WHERE job_id = $1`,
      [quote.job_id, quote.id],
    );
    await client.query(
      `UPDATE ekazi_jobs
          SET status = 'booked', accepted_quote_id = $2, updated_at = NOW()
        WHERE id = $1`,
      [quote.job_id, quote.id],
    );
    await client.query(
      `UPDATE ekazi_job_dispatches
          SET status = CASE WHEN handyman_user_id = $2 THEN 'booked' ELSE 'closed' END,
              responded_at = COALESCE(responded_at, NOW()),
              updated_at = NOW()
        WHERE job_id = $1`,
      [quote.job_id, quote.handyman_user_id],
    );
    const grossCommissionAmount = Math.round(Number(quote.labor || 0) * COMMISSION_PERCENT) / 100;
    const commissionAmount = Math.max(0, grossCommissionAmount - Number(quote.discount_amount || 0));
    const payoutAmount = Math.max(0, Number(quote.total || 0) - commissionAmount);
    const bookingResult = await client.query(
      `INSERT INTO ekazi_bookings (
         job_id, quote_id, client_user_id, handyman_user_id,
         subtotal, discount_amount, total, payment_method, payment_status,
         organization_commission_percent, organization_commission_amount, handyman_payout_amount
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (job_id) DO UPDATE SET status = ekazi_bookings.status
       RETURNING *`,
      [
        quote.job_id,
        quote.id,
        clientId,
        quote.handyman_user_id,
        quote.subtotal,
        quote.discount_amount,
        quote.total,
        paymentMethod,
        paymentMethod === 'card' ? 'pending_card_payment' : 'cash_to_provider',
        COMMISSION_PERCENT,
        commissionAmount,
        payoutAmount,
      ],
    );
    const booking = bookingResult.rows[0];
    const conversationResult = await client.query(
      `INSERT INTO ekazi_conversations (booking_id, job_id, client_user_id, handyman_user_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (booking_id) DO UPDATE SET updated_at = ekazi_conversations.updated_at
       RETURNING id`,
      [booking.id, quote.job_id, clientId, quote.handyman_user_id],
    );
    await client.query('COMMIT');
    notifyBookingLifecycle(pool, booking.id, 'EKAZI_QUOTE_ACCEPTED', clientId).catch((notifyError) => {
      console.warn('[ekazi-notify] quote_accept_failed', { bookingId: booking.id, message: notifyError?.message });
    });
    const conversationId = conversationResult.rows[0]?.id;
    return res.json({
      ok: true,
      booking: { ...booking, id: String(booking.id), conversationId: conversationId ? String(conversationId) : null },
      jobId: String(quote.job_id),
      quoteId: String(quote.id),
      conversationId: conversationId ? String(conversationId) : null,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('acceptQuote error:', error);
    return res.status(500).json({ message: 'Could not accept quote' });
  } finally {
    client.release();
  }
};

export const declineQuote = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const clientId = userId(req);
    const reason = normalizeCancellation(req.body) || {
      reason: String(req.body?.reason || 'Quote declined').slice(0, 240),
      code: String(req.body?.reasonCode || req.body?.code || 'price_or_fit').slice(0, 80),
      notes: String(req.body?.notes || '').slice(0, 500) || null,
    };
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_quotes q
          SET status = 'declined',
              declined_at = NOW(),
              decline_reason = $3,
              decline_reason_code = $4,
              decline_notes = $5,
              updated_at = NOW()
         FROM ekazi_jobs j
        WHERE q.id = $1
          AND q.job_id = j.id
          AND j.client_user_id = $2
          AND q.status = 'open'
          AND j.status IN ('active','quoted')
        RETURNING q.id, q.job_id, q.handyman_user_id`,
      [req.params.id, clientId, reason.reason, reason.code, reason.notes],
    );
    const quote = rows[0];
    if (!quote) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This quote can no longer be declined.' });
    }
    await client.query(
      `UPDATE ekazi_job_dispatches
          SET status = 'declined', responded_at = NOW(), updated_at = NOW()
        WHERE job_id = $1 AND handyman_user_id = $2`,
      [quote.job_id, quote.handyman_user_id],
    );
    const remaining = await client.query(
      `SELECT COUNT(*)::int AS count FROM ekazi_quotes WHERE job_id = $1 AND status = 'open'`,
      [quote.job_id],
    );
    if (Number(remaining.rows[0]?.count || 0) === 0) {
      await client.query(
        `UPDATE ekazi_jobs SET status = 'active', updated_at = NOW()
          WHERE id = $1 AND status = 'quoted'`,
        [quote.job_id],
      );
    }
    await client.query('COMMIT');
    const forwarded = await forwardJobAfterQuoteDecline(pool, quote.id).catch((dispatchError) => {
      console.warn('[ekazi-dispatch] quote_decline_forward_failed', { quoteId: quote.id, message: dispatchError?.message });
      return { offered: [] };
    });
    return res.json({ ok: true, forwardedTo: forwarded.offered?.length || 0 });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('declineQuote error:', error);
    return res.status(500).json({ message: 'Could not decline quote' });
  } finally {
    client.release();
  }
};

export const quoteMessage = async (_req, res) => {
  return res.status(400).json({
    message: 'Accept the quote to open a conversation with the provider.',
  });
};



export const markBookingArrived = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_bookings
          SET status = 'in_progress',
              arrived_at = COALESCE(arrived_at, NOW())
        WHERE id = $1
          AND handyman_user_id = $2
          AND status IN ('confirmed', 'in_progress')
        RETURNING id, job_id, status, arrived_at`,
      [req.params.id, actorId],
    );
    const booking = rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only the assigned provider can mark an active booking as arrived.' });
    }
    await client.query(
      `UPDATE ekazi_jobs SET status = 'in_progress', updated_at = NOW()
        WHERE id = $1 AND status IN ('booked', 'quoted', 'active')`,
      [booking.job_id],
    );
    await client.query('COMMIT');
    notifyBookingLifecycle(pool, booking.id, 'EKAZI_PROVIDER_ARRIVED', actorId).catch((notifyError) => {
      console.warn('[ekazi-notify] booking_arrived_failed', { bookingId: booking.id, message: notifyError?.message });
    });
    return res.json({ ok: true, bookingId: String(booking.id), status: booking.status, arrivedAt: booking.arrived_at });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('markBookingArrived error:', error);
    return res.status(500).json({ message: 'Could not mark arrival' });
  } finally {
    client.release();
  }
};

export const markBookingComplete = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_bookings
          SET status = 'completed',
              arrived_at = COALESCE(arrived_at, NOW()),
              completed_at = COALESCE(completed_at, NOW())
        WHERE id = $1
          AND handyman_user_id = $2
          AND status IN ('confirmed', 'in_progress')
        RETURNING id, job_id, handyman_user_id, status, arrived_at, completed_at`,
      [req.params.id, actorId],
    );
    const booking = rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Only the assigned provider can complete an active booking.' });
    }
    const paymentGate = await client.query(
      `SELECT payment_method, payment_status FROM ekazi_bookings WHERE id = $1`,
      [booking.id],
    );
    const paymentState = paymentGate.rows[0];
    if (
      String(paymentState?.payment_method || '').toLowerCase() === 'card' &&
      String(paymentState?.payment_status || '').toLowerCase() !== 'platform_collected'
    ) {
      await client.query('ROLLBACK');
      return res.status(402).json({ message: 'Card payment must be completed before the provider can mark this booking complete.' });
    }
    await client.query(
      `UPDATE ekazi_jobs SET status = 'completed', updated_at = NOW()
        WHERE id = $1`,
      [booking.job_id],
    );
    await client.query(
      `UPDATE ekazi_handyman_profiles
          SET jobs_completed = jobs_completed + 1,
              updated_at = NOW()
        WHERE user_id = $1`,
      [booking.handyman_user_id],
    );
    const fullBooking = await client.query('SELECT * FROM ekazi_bookings WHERE id = $1', [booking.id]);
    const settlement = await recordBookingSettlement(client, fullBooking.rows[0] || booking);
    await client.query('COMMIT');
    notifyBookingLifecycle(pool, booking.id, 'EKAZI_JOB_COMPLETED', actorId).catch((notifyError) => {
      console.warn('[ekazi-notify] booking_complete_failed', { bookingId: booking.id, message: notifyError?.message });
    });
    return res.json({ ok: true, bookingId: String(booking.id), status: booking.status, arrivedAt: booking.arrived_at, completedAt: booking.completed_at, settlement });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('markBookingComplete error:', error);
    return res.status(500).json({ message: 'Could not complete booking' });
  } finally {
    client.release();
  }
};

export const rateBookingProvider = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    const rating = Number(req.body?.rating);
    const review = String(req.body?.comment || req.body?.review || '').trim().slice(0, 700);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ message: 'Choose a rating from 1 to 5.' });
    }
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_bookings
          SET client_rating = $3,
              client_review = $4,
              client_reviewed_at = NOW()
        WHERE id = $1
          AND client_user_id = $2
          AND status = 'completed'
          AND client_rating IS NULL
        RETURNING id, handyman_user_id, client_rating, client_review, client_reviewed_at`,
      [req.params.id, actorId, rating, review || null],
    );
    const booking = rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This booking is not ready for rating or has already been rated.' });
    }
    await client.query(
      `INSERT INTO ekazi_handyman_profiles (user_id) VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [booking.handyman_user_id],
    );
    await client.query(
      `WITH stats AS (
         SELECT ROUND(AVG(client_rating)::numeric, 2) AS avg_rating, COUNT(*)::int AS rating_count
           FROM ekazi_bookings
          WHERE handyman_user_id = $1 AND client_rating IS NOT NULL
       )
       UPDATE ekazi_handyman_profiles
          SET rating_avg = COALESCE((SELECT avg_rating FROM stats), 0),
              rating_count = COALESCE((SELECT rating_count FROM stats), 0),
              updated_at = NOW()
        WHERE user_id = $1`,
      [booking.handyman_user_id],
    );
    await client.query('COMMIT');
    return res.json({
      ok: true,
      review: {
        rating: Number(booking.client_rating),
        comment: booking.client_review || '',
        reviewedAt: booking.client_reviewed_at,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('rateBookingProvider error:', error);
    return res.status(500).json({ message: 'Could not save rating' });
  } finally {
    client.release();
  }
};

export const reportClientIssue = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    const issue = normalizeClientIssue(req.body);
    if (!issue) {
      return res.status(400).json({
        message: 'Choose a valid client issue before submitting feedback.',
        reasons: Object.entries(CLIENT_ISSUE_REASONS).map(([code, item]) => ({ code, label: item.label, impact: item.impact, severe: item.severe })),
      });
    }
    await client.query('BEGIN');
    const bookingResult = await client.query(
      `SELECT id, job_id, client_user_id, handyman_user_id, status
         FROM ekazi_bookings
        WHERE id = $1 AND handyman_user_id = $2
        FOR UPDATE`,
      [req.params.id, actorId],
    );
    const booking = bookingResult.rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Booking not found for this provider.' });
    }
    await client.query(
      `INSERT INTO ekazi_client_issue_reports
         (booking_id, job_id, client_user_id, provider_user_id, reason_code, reason, impact_points, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending_review')
       ON CONFLICT (booking_id, provider_user_id, reason_code) DO UPDATE SET
         reason = EXCLUDED.reason,
         impact_points = EXCLUDED.impact_points,
         notes = EXCLUDED.notes,
         status = 'pending_review',
         reviewed_by = NULL,
         reviewed_at = NULL
       RETURNING id`,
      [booking.id, booking.job_id, booking.client_user_id, booking.handyman_user_id, issue.code, issue.reason, issue.impact, issue.notes],
    );
    const { rows } = await client.query(
      `UPDATE users
          SET client_issue_count = COALESCE(client_issue_count, 0) + 1,
              client_rating_score = GREATEST(0, COALESCE(client_rating_score, 100) - $2),
              trust_warning_count = trust_warning_count + CASE WHEN $2 >= 10 THEN 1 ELSE 0 END,
              account_status = CASE
                WHEN $3::boolean THEN 'banned'
                WHEN GREATEST(0, COALESCE(client_rating_score, 100) - $2) < 75 THEN 'suspended'
                ELSE account_status
              END,
              suspended_until = CASE
                WHEN $3::boolean THEN suspended_until
                WHEN GREATEST(0, COALESCE(client_rating_score, 100) - $2) < 75 THEN NOW() + INTERVAL '1 day'
                ELSE suspended_until
              END,
              suspension_reason = CASE
                WHEN $3::boolean THEN 'Gross client issue reported by provider: ' || $4
                WHEN GREATEST(0, COALESCE(client_rating_score, 100) - $2) < 75 THEN 'Client trust score below 75 after provider reports'
                ELSE suspension_reason
              END
        WHERE id = $1
        RETURNING client_rating_score, client_issue_count, trust_warning_count, account_status, suspended_until`,
      [booking.client_user_id, issue.impact, issue.severe, issue.reason],
    );
    await client.query('COMMIT');
    return res.json({ ok: true, clientTrust: rows[0] || null });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('reportClientIssue error:', error);
    return res.status(500).json({ message: 'Could not submit client feedback' });
  } finally {
    client.release();
  }
};

export const getBooking = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const { rows } = await pool.query(
      `SELECT b.*, j.service_name, j.category_name, j.description,
               j.address, j.estate, j.city, j.schedule_type, j.scheduled_for,
               j.flexible_schedule, j.latitude, j.longitude,
               hu.name AS handyman_name, hu.phone AS handyman_phone,
               cu.name AS client_name, cu.phone AS client_phone,
               q.eta_minutes, q.duration_hours,
               c.id AS conversation_id
          FROM ekazi_bookings b
          JOIN ekazi_jobs j ON j.id = b.job_id
          JOIN ekazi_quotes q ON q.id = b.quote_id
          JOIN users hu ON hu.id = b.handyman_user_id
          JOIN users cu ON cu.id = b.client_user_id
          LEFT JOIN ekazi_conversations c ON c.booking_id = b.id
         WHERE b.id = $1 AND (b.client_user_id = $2 OR b.handyman_user_id = $2)`,
      [req.params.id, userId(req)],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Booking not found' });
    return res.json({
      booking: {
        id: String(row.id),
        conversationId: row.conversation_id ? String(row.conversation_id) : null,
        status: row.status,
        paymentMethod: row.payment_method || 'cash',
        paymentStatus: row.payment_status || 'unpaid',
        providerSettlementStatus: row.provider_settlement_status || 'pending',
        arrivedAt: row.arrived_at || null,
        completedAt: row.completed_at || null,
        review: {
          rating: row.client_rating == null ? null : Number(row.client_rating),
          comment: row.client_review || '',
          reviewedAt: row.client_reviewed_at || null,
        },
        subtotal: Number(row.subtotal),
        discountAmount: Number(row.discount_amount),
        total: Number(row.total),
        commission: {
          percent: Number(row.organization_commission_percent || COMMISSION_PERCENT),
          amount: Number(row.organization_commission_amount || 0),
          due: row.handyman_user_id ? await providerCommissionDue(pool, row.handyman_user_id).catch(() => 0) : 0,
          handymanPayout: Number(row.handyman_payout_amount || 0),
        },
        handyman: {
          id: String(row.handyman_user_id),
          name: row.handyman_name,
          phone: row.handyman_phone,
        },
        client: {
          id: String(row.client_user_id),
          name: row.client_name,
          phone: row.client_phone,
        },
        job: {
          id: String(row.job_id),
          serviceName: row.service_name || row.category_name,
          description: row.description,
          address: row.address,
          estate: row.estate,
          latitude: row.latitude,
          longitude: row.longitude,
          city: row.city,
          scheduleType: row.schedule_type,
          scheduledFor: row.scheduled_for,
          flexibleSchedule: row.flexible_schedule,
        },
        etaMinutes: row.eta_minutes,
        route: bookingRouteJson(row),
        durationHours: row.duration_hours == null ? null : Number(row.duration_hours),
      },
    });
  } catch (error) {
    console.error('getBooking error:', error);
    return res.status(500).json({ message: 'Could not load booking' });
  }
};

export const updateBookingLocation = async (req, res) => {
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    const latitude = toFiniteNumber(req.body?.latitude);
    const longitude = toFiniteNumber(req.body?.longitude);
    const accuracy = toFiniteNumber(req.body?.accuracy);
    if (latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return res.status(400).json({ message: 'A valid latitude and longitude are required.' });
    }
    const { rows } = await pool.query(
      `UPDATE ekazi_bookings
          SET handyman_latitude = $3,
              handyman_longitude = $4,
              handyman_location_accuracy = $5,
              handyman_location_updated_at = NOW()
        WHERE id = $1
          AND handyman_user_id = $2
          AND status IN ('confirmed', 'in_progress')
        RETURNING id, handyman_latitude, handyman_longitude, handyman_location_accuracy, handyman_location_updated_at`,
      [req.params.id, actorId, latitude, longitude, accuracy],
    );
    if (!rows.length) return res.status(404).json({ message: 'Active booking not found for this provider.' });
    return res.json({ ok: true, location: {
      latitude: rows[0].handyman_latitude,
      longitude: rows[0].handyman_longitude,
      accuracy: rows[0].handyman_location_accuracy,
      updatedAt: rows[0].handyman_location_updated_at,
    } });
  } catch (error) {
    console.error('updateBookingLocation error:', error);
    return res.status(500).json({ message: 'Could not update route location' });
  }
};

export const cancelBooking = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMarketplaceSchema();
    const actorId = userId(req);
    const reason = normalizeCancellation(req.body);
    if (!reason) {
      return res.status(400).json({
        message: 'Cancellation reason is required',
        examples: [
          'Client: schedule changed, budget changed, unsafe behaviour, no longer needed',
          'Provider: emergency, unavailable materials, client unreachable, unsafe site',
        ],
      });
    }
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT *
         FROM ekazi_bookings
        WHERE id = $1
          AND (client_user_id = $2 OR handyman_user_id = $2)
          AND status IN ('confirmed', 'in_progress')
        FOR UPDATE`,
      [req.params.id, actorId],
    );
    const booking = current.rows[0];
    if (!booking) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Booking can no longer be cancelled' });
    }
    const actor = Number(booking.handyman_user_id) === Number(actorId) ? 'handyman' : 'client';
    const { rows } = await client.query(
      `UPDATE ekazi_bookings
           SET status = 'cancelled',
               cancelled_by = $3,
               cancellation_reason = $4,
               cancellation_reason_code = $5,
               cancellation_notes = $6,
               cancelled_at = NOW()
         WHERE id = $1
           AND (client_user_id = $2 OR handyman_user_id = $2)
           AND status IN ('confirmed', 'in_progress')
         RETURNING job_id, quote_id`,
      [req.params.id, actorId, actor, reason.reason, reason.code, reason.notes],
    );
    await client.query(
      `UPDATE ekazi_jobs SET status = 'quoted', accepted_quote_id = NULL, updated_at = NOW()
        WHERE id = $1`,
      [rows[0].job_id],
    );
    await client.query(
      `UPDATE ekazi_quotes SET status = 'open', updated_at = NOW()
        WHERE job_id = $1`,
      [rows[0].job_id],
    );
    const trust = await applyCancellationTrustPenalty(client, actor, actorId, reason);
    await client.query('COMMIT');
    const cancelKind = actor === 'handyman' ? 'EKAZI_BOOKING_CANCELLED_CLIENT' : 'EKAZI_BOOKING_CANCELLED_PROVIDER';
    notifyBookingLifecycle(pool, req.params.id, cancelKind, actorId).catch((notifyError) => {
      console.warn('[ekazi-notify] booking_cancel_failed', { bookingId: req.params.id, message: notifyError?.message });
    });
    if (actor === 'handyman') {
      dispatchJobToNearestProviders(pool, rows[0].job_id, { reason: 'provider_cancelled', fanout: 1 }).catch((dispatchError) => {
        console.warn('[ekazi-dispatch] provider_cancel_forward_failed', { jobId: rows[0].job_id, message: dispatchError?.message });
      });
    }
    return res.json({ ok: true, cancelledBy: actor, trust });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('cancelBooking error:', error);
    return res.status(500).json({ message: 'Could not cancel booking' });
  } finally {
    client.release();
  }
};
