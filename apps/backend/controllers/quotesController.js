import pool from '../config/db.js';
import { ensureMarketplaceSchema, quoteJson } from '../services/marketplaceStore.js';

function userId(req) {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const COMMISSION_PERCENT = 15;

const quoteSelect = `
  SELECT q.*, u.name AS handyman_name, u.phone AS handyman_phone,
         hp.business_name, hp.rating_avg, hp.rating_count,
         hp.verified, hp.profile_image_url, hp.profile_image_status, hp.id_document_status,
         hp.certificate_status, hp.good_conduct_status, hp.verification_status,
         hp.jobs_completed, hp.cancellation_score, hp.suspended_until
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
  if (!row.phone) return { ok: false, status: 400, message: 'Handyman must add a valid Kenyan phone number before continuing.' };
  if (!row.verified || row.profile_image_status !== 'approved' || row.id_document_status !== 'approved') {
    return { ok: false, status: 403, message: 'Your Ekazi handyman account must have an approved profile photo and national ID before receiving or sending quotes.' };
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
        [userId, profile.suspended_until, `Repeated handyman cancellations: ${reason.reason}`],
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
      return res.status(403).json({ message: 'Only handyman accounts can submit quotes' });
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
      return res.status(409).json({ message: 'Client must add a phone number before handymen can quote this job' });
    }

    const discountAmount = Math.round(
      (subtotal * Number(job.discount_percent || 0)) / 100,
    );
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
    await pool.query(
      `UPDATE ekazi_jobs SET status = 'quoted', updated_at = NOW()
        WHERE id = $1 AND status = 'active'`,
      [job.id],
    );
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
      return res.status(400).json({ message: 'Add a valid phone number before accepting a quote so the handyman can contact you.' });
    }
    if (!quote.handyman_phone) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'This handyman must add a phone number before their quote can be accepted.' });
    }
    if (!quote.handyman_verified || quote.profile_image_status !== 'approved' || quote.id_document_status !== 'approved') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This handyman is not yet approved by Ekazi for client bookings.' });
    }
    if (!['active', 'quoted'].includes(quote.job_status) || quote.status !== 'open') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This quote is no longer available' });
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
    const commissionAmount = Math.round(Number(quote.total || 0) * COMMISSION_PERCENT) / 100;
    const payoutAmount = Math.max(0, Number(quote.total || 0) - commissionAmount);
    const bookingResult = await client.query(
      `INSERT INTO ekazi_bookings (
         job_id, quote_id, client_user_id, handyman_user_id,
         subtotal, discount_amount, total,
         organization_commission_percent, organization_commission_amount, handyman_payout_amount
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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

export const quoteMessage = async (_req, res) => {
  return res.status(400).json({
    message: 'Accept the quote to open a conversation with the handyman.',
  });
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
        subtotal: Number(row.subtotal),
        discountAmount: Number(row.discount_amount),
        total: Number(row.total),
        commission: {
          percent: Number(row.organization_commission_percent || COMMISSION_PERCENT),
          amount: Number(row.organization_commission_amount || 0),
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
        durationHours: row.duration_hours == null ? null : Number(row.duration_hours),
      },
    });
  } catch (error) {
    console.error('getBooking error:', error);
    return res.status(500).json({ message: 'Could not load booking' });
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
          'Handyman: emergency, unavailable materials, client unreachable, unsafe site',
        ],
      });
    }
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT *
         FROM ekazi_bookings
        WHERE id = $1
          AND (client_user_id = $2 OR handyman_user_id = $2)
          AND status = 'confirmed'
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
         WHERE id = $1 AND status = 'confirmed'
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
    return res.json({ ok: true, cancelledBy: actor, trust });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('cancelBooking error:', error);
    return res.status(500).json({ message: 'Could not cancel booking' });
  } finally {
    client.release();
  }
};
