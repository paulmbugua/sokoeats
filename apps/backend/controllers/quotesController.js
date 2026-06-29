import pool from '../config/db.js';
import { ensureMarketplaceSchema, quoteJson } from '../services/marketplaceStore.js';

function userId(req) {
  const id = Number(req.user?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const quoteSelect = `
  SELECT q.*, u.name AS handyman_name,
         hp.business_name, hp.rating_avg, hp.rating_count,
         hp.verified, hp.jobs_completed
    FROM ekazi_quotes q
    JOIN users u ON u.id = q.handyman_user_id
    LEFT JOIN ekazi_handyman_profiles hp ON hp.user_id = q.handyman_user_id
`;

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

    const roleResult = await pool.query('SELECT role FROM users WHERE id = $1', [handymanId]);
    if (roleResult.rows[0]?.role !== 'tutor') {
      return res.status(403).json({ message: 'Only handyman accounts can submit quotes' });
    }
    const jobResult = await pool.query(
      `SELECT * FROM ekazi_jobs
        WHERE id = $1 AND status IN ('active','quoted') AND client_user_id <> $2`,
      [req.params.id, handymanId],
    );
    const job = jobResult.rows[0];
    if (!job) return res.status(404).json({ message: 'Open job not found' });

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
      `${quoteSelect.replace('SELECT q.*', 'SELECT q.*, j.description AS job_description, j.estate AS job_estate, j.city AS job_city, j.status AS job_status')}
       JOIN ekazi_jobs j ON j.id = q.job_id
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
    const result = await client.query(
      `SELECT q.*, j.client_user_id, j.status AS job_status
         FROM ekazi_quotes q
         JOIN ekazi_jobs j ON j.id = q.job_id
        WHERE q.id = $1 AND j.client_user_id = $2
        FOR UPDATE OF q, j`,
      [req.params.id, clientId],
    );
    const quote = result.rows[0];
    if (!quote) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quote not found' });
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
    const bookingResult = await client.query(
      `INSERT INTO ekazi_bookings (
         job_id, quote_id, client_user_id, handyman_user_id,
         subtotal, discount_amount, total
       ) VALUES ($1,$2,$3,$4,$5,$6,$7)
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
      ],
    );
    await client.query('COMMIT');
    const booking = bookingResult.rows[0];
    return res.json({
      ok: true,
      booking: { ...booking, id: String(booking.id) },
      jobId: String(quote.job_id),
      quoteId: String(quote.id),
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
               j.flexible_schedule, u.name AS handyman_name, u.phone AS handyman_phone,
               q.eta_minutes, q.duration_hours
          FROM ekazi_bookings b
          JOIN ekazi_jobs j ON j.id = b.job_id
          JOIN ekazi_quotes q ON q.id = b.quote_id
          JOIN users u ON u.id = b.handyman_user_id
         WHERE b.id = $1 AND b.client_user_id = $2`,
      [req.params.id, userId(req)],
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ message: 'Booking not found' });
    return res.json({
      booking: {
        id: String(row.id),
        status: row.status,
        subtotal: Number(row.subtotal),
        discountAmount: Number(row.discount_amount),
        total: Number(row.total),
        handyman: {
          id: String(row.handyman_user_id),
          name: row.handyman_name,
          phone: row.handyman_phone,
        },
        job: {
          id: String(row.job_id),
          serviceName: row.service_name || row.category_name,
          description: row.description,
          address: row.address,
          estate: row.estate,
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
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE ekazi_bookings
           SET status = 'cancelled'
         WHERE id = $1 AND client_user_id = $2 AND status = 'confirmed'
         RETURNING job_id, quote_id`,
      [req.params.id, userId(req)],
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Booking can no longer be cancelled' });
    }
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
    await client.query('COMMIT');
    return res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('cancelBooking error:', error);
    return res.status(500).json({ message: 'Could not cancel booking' });
  } finally {
    client.release();
  }
};
