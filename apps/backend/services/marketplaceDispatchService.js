import { sendPushToMany, sendPushToUser } from './pushService.js';

const EKAZI_ACTION_CHANNEL = 'ekazi-actions-v2';
const DEFAULT_FANOUT = 3;

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function money(value) {
  return `KES ${Math.round(Number(value || 0)).toLocaleString('en-KE')}`;
}

function jobLabel(job) {
  return job?.service_name || job?.category_name || 'Ekazi job';
}

function locationLabel(job) {
  return [job?.estate, job?.city].filter(Boolean).join(', ') || 'near you';
}

function actionPayload(kind, title, body, data = {}) {
  return {
    title,
    body,
    channelId: EKAZI_ACTION_CHANNEL,
    sound: 'ekazi_alert.wav',
    priority: 'high',
    data: { kind, type: kind, ...data },
  };
}

async function recordNotificationEvent(db, userId, kind, payload) {
  try {
    await db.query(
      `INSERT INTO ekazi_notification_events (user_id, kind, title, body, data)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [userId, kind, payload.title, payload.body, JSON.stringify(payload.data || {})],
    );
  } catch (error) {
    console.warn('[ekazi-notify] event_log_failed', { kind, userId, message: error?.message });
  }
}

export async function dispatchJobToNearestProviders(db, jobId, options = {}) {
  const fanout = Math.max(1, Math.min(Number(options.fanout || DEFAULT_FANOUT), 5));
  const reason = String(options.reason || 'created');
  const { rows: jobRows } = await db.query(
    `SELECT j.*, u.name AS client_name
       FROM ekazi_jobs j
       JOIN users u ON u.id = j.client_user_id
      WHERE j.id = $1 AND j.status IN ('active','quoted')
      LIMIT 1`,
    [jobId],
  );
  const job = jobRows[0];
  if (!job) return { offered: [], reason: 'job_not_open' };

  const { rows: providers } = await db.query(
    `WITH candidates AS (
       SELECT hp.user_id,
              u.name,
              hp.business_name,
              hp.latitude,
              hp.longitude,
              hp.service_radius_km,
              CASE
                WHEN hp.latitude IS NOT NULL AND hp.longitude IS NOT NULL AND $2::double precision IS NOT NULL AND $3::double precision IS NOT NULL THEN
                  6371 * acos(LEAST(1, GREATEST(-1,
                    cos(radians(hp.latitude)) * cos(radians($2::double precision)) * cos(radians($3::double precision) - radians(hp.longitude)) +
                    sin(radians(hp.latitude)) * sin(radians($2::double precision))
                  )))
                ELSE NULL
              END AS distance_km,
              CASE WHEN hp.latitude IS NOT NULL AND hp.longitude IS NOT NULL AND $2::double precision IS NOT NULL AND $3::double precision IS NOT NULL THEN 0 ELSE 1 END AS nearest_rank
         FROM ekazi_handyman_profiles hp
         JOIN users u ON u.id = hp.user_id
        WHERE u.role = 'tutor'
          AND u.phone IS NOT NULL
          AND COALESCE(u.account_status, 'active') <> 'banned'
          AND (u.suspended_until IS NULL OR u.suspended_until <= NOW())
          AND hp.verified = TRUE
          AND hp.profile_image_status = 'approved'
          AND hp.id_document_status = 'approved'
          AND hp.user_id <> $4
          AND (cardinality(hp.categories) = 0 OR $5 = ANY(hp.categories) OR COALESCE($6, '') = ANY(hp.categories))
          AND NOT EXISTS (SELECT 1 FROM ekazi_quotes q WHERE q.job_id = $1 AND q.handyman_user_id = hp.user_id)
          AND NOT EXISTS (SELECT 1 FROM ekazi_job_dispatches d WHERE d.job_id = $1 AND d.handyman_user_id = hp.user_id AND d.status IN ('offered','quoted','booked','declined'))
     )
     SELECT * FROM candidates
      WHERE distance_km IS NULL OR distance_km <= COALESCE(service_radius_km, 20)
      ORDER BY nearest_rank ASC, distance_km ASC NULLS LAST, user_id ASC
      LIMIT $7`,
    [job.id, toFiniteNumber(job.latitude), toFiniteNumber(job.longitude), job.client_user_id, job.category_id, job.service_id, fanout],
  );

  const offered = [];
  let rank = 0;
  for (const provider of providers) {
    rank += 1;
    const inserted = await db.query(
      `INSERT INTO ekazi_job_dispatches (job_id, handyman_user_id, status, offer_rank, distance_km, reason, notified_at)
       VALUES ($1, $2, 'offered', $3, $4, $5, NOW())
       ON CONFLICT (job_id, handyman_user_id) DO NOTHING
       RETURNING *`,
      [job.id, provider.user_id, rank, provider.distance_km, reason],
    );
    if (!inserted.rows.length) continue;
    offered.push(provider);
  }

  if (offered.length) {
    const payload = actionPayload(
      'EKAZI_JOB_OFFER',
      'New nearby Ekazi job',
      `${jobLabel(job)} in ${locationLabel(job)}. Send your quote now.`,
      { screen: 'Tabs', params: { screen: 'Home' }, jobId: String(job.id) },
    );
    await sendPushToMany(offered.map((p) => p.user_id), payload);
    await Promise.all(offered.map((p) => recordNotificationEvent(db, p.user_id, 'EKAZI_JOB_OFFER', payload)));
  }

  const clientPayload = actionPayload(
    'EKAZI_PROVIDERS_ALERTED',
    offered.length ? 'Nearby providers alerted' : 'We are still looking',
    offered.length
      ? `We sent your ${jobLabel(job)} request to ${offered.length} nearby provider${offered.length === 1 ? '' : 's'}.`
      : 'No verified provider matched instantly. Ekazi will keep the job open for providers in your area.',
    { screen: 'Tabs', params: { screen: 'Requests' }, jobId: String(job.id), offeredCount: offered.length },
  );
  await sendPushToUser(job.client_user_id, clientPayload);
  await recordNotificationEvent(db, job.client_user_id, 'EKAZI_PROVIDERS_ALERTED', clientPayload);

  return { offered, job };
}

export async function notifyQuoteSubmitted(db, quoteId, options = {}) {
  const { rows } = await db.query(
    `SELECT q.*, j.client_user_id, j.service_name, j.category_name, j.estate, j.city,
            u.name AS provider_name, hp.business_name
       FROM ekazi_quotes q
       JOIN ekazi_jobs j ON j.id = q.job_id
       JOIN users u ON u.id = q.handyman_user_id
       LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = q.handyman_user_id
      WHERE q.id = $1`,
    [quoteId],
  );
  const row = rows[0];
  if (!row) return;
  await db.query(
    `UPDATE ekazi_job_dispatches
        SET status = 'quoted', responded_at = COALESCE(responded_at, NOW()), updated_at = NOW()
      WHERE job_id = $1 AND handyman_user_id = $2`,
    [row.job_id, row.handyman_user_id],
  );
  const providerName = row.business_name || row.provider_name || 'A provider';
  const title = options.updated ? 'Quote updated' : 'New quote received';
  const payload = actionPayload(
    options.updated ? 'EKAZI_QUOTE_UPDATED' : 'EKAZI_QUOTE_RECEIVED',
    title,
    `${providerName} quoted ${money(row.total)} for ${jobLabel(row)}.`,
    { screen: 'QuotesInbox', params: { jobId: String(row.job_id) }, jobId: String(row.job_id), quoteId: String(row.id) },
  );
  console.log('[ekazi-notify] quote_client_push:start', { quoteId: String(row.id), jobId: String(row.job_id), clientUserId: String(row.client_user_id), kind: payload.data.kind });
  await sendPushToUser(row.client_user_id, payload);
  await recordNotificationEvent(db, row.client_user_id, payload.data.kind, payload);
  console.log('[ekazi-notify] quote_client_push:sent', { quoteId: String(row.id), clientUserId: String(row.client_user_id), kind: payload.data.kind });
}

export async function notifyBookingLifecycle(db, bookingId, kind, actorId = null) {
  const { rows } = await db.query(
    `SELECT b.*, j.service_name, j.category_name, j.estate, j.city,
            cu.name AS client_name, hu.name AS provider_name
       FROM ekazi_bookings b
       JOIN ekazi_jobs j ON j.id = b.job_id
       JOIN users cu ON cu.id = b.client_user_id
       JOIN users hu ON hu.id = b.handyman_user_id
      WHERE b.id = $1`,
    [bookingId],
  );
  const booking = rows[0];
  if (!booking) return;

  const service = jobLabel(booking);
  const variants = {
    EKAZI_QUOTE_ACCEPTED: {
      userId: booking.handyman_user_id,
      title: 'Quote accepted',
      body: `${booking.client_name || 'Your client'} accepted your ${service} quote. Start heading there when ready.`,
      data: { screen: 'BookingConfirmed', params: { bookingId: String(booking.id), jobId: String(booking.job_id), quoteId: String(booking.quote_id) }, bookingId: String(booking.id), jobId: String(booking.job_id) },
    },
    EKAZI_PROVIDER_ARRIVED: {
      userId: booking.client_user_id,
      title: 'Provider has arrived',
      body: `${booking.provider_name || 'Your provider'} has arrived for ${service}.`,
      data: { screen: 'BookingConfirmed', params: { bookingId: String(booking.id), jobId: String(booking.job_id), quoteId: String(booking.quote_id) }, bookingId: String(booking.id), jobId: String(booking.job_id) },
    },
    EKAZI_JOB_COMPLETED: {
      userId: booking.client_user_id,
      title: 'Service marked complete',
      body: `Please rate ${booking.provider_name || 'your provider'} for the ${service} job.`,
      data: { screen: 'BookingConfirmed', params: { bookingId: String(booking.id), jobId: String(booking.job_id), quoteId: String(booking.quote_id), rateNow: true }, bookingId: String(booking.id), jobId: String(booking.job_id) },
    },
    EKAZI_BOOKING_CANCELLED_CLIENT: {
      userId: booking.client_user_id,
      title: 'Booking cancelled',
      body: `${booking.provider_name || 'Your provider'} cancelled the ${service} booking. We reopened your request.`,
      data: { screen: 'Tabs', params: { screen: 'Requests' }, bookingId: String(booking.id), jobId: String(booking.job_id) },
    },
    EKAZI_BOOKING_CANCELLED_PROVIDER: {
      userId: booking.handyman_user_id,
      title: 'Booking cancelled',
      body: `${booking.client_name || 'Your client'} cancelled the ${service} booking.`,
      data: { screen: 'Tabs', params: { screen: 'Requests' }, bookingId: String(booking.id), jobId: String(booking.job_id) },
    },
  };

  const variant = variants[kind];
  if (!variant?.userId) return;
  if (actorId && Number(actorId) === Number(variant.userId)) return;
  const payload = actionPayload(kind, variant.title, variant.body, variant.data);
  await sendPushToUser(variant.userId, payload);
  await recordNotificationEvent(db, variant.userId, kind, payload);
}

export async function forwardJobAfterQuoteDecline(db, quoteId) {
  const { rows } = await db.query(
    `SELECT q.job_id, q.handyman_user_id
       FROM ekazi_quotes q
      WHERE q.id = $1`,
    [quoteId],
  );
  const quote = rows[0];
  if (!quote) return { offered: [] };
  await db.query(
    `UPDATE ekazi_job_dispatches
        SET status = 'declined', responded_at = NOW(), updated_at = NOW()
      WHERE job_id = $1 AND handyman_user_id = $2`,
    [quote.job_id, quote.handyman_user_id],
  );
  return dispatchJobToNearestProviders(db, quote.job_id, { fanout: 1, reason: 'quote_declined' });
}
