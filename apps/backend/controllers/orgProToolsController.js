// apps/backend/controllers/orgProToolsController.js
import pool from '../config/db.js';
import { requireOrgTier } from '../utils/orgTierGuard.js';

const PRO_ONLY = ['pro', 'enterprise'];

function normalizeOrgId(req) {
  return req.params.orgId || req.params.org_id || req.body.org_id;
}

// ───────────────────────── Attendance ─────────────────────────
export async function createAttendanceSession(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { session_date, class_label, period_label } = req.body || {};
    if (!session_date) return res.status(400).json({ message: 'session_date required' });

    const { rows } = await pool.query(
      `INSERT INTO org_attendance_sessions (org_id, instructor_id, session_date, class_label, period_label)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [orgId, req.user?.id ?? null, session_date, class_label || null, period_label || null],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to create session' });
  }
}

export async function upsertAttendanceEntries(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { session_id, entries } = req.body || {};
    if (!session_id || !Array.isArray(entries)) {
      return res.status(400).json({ message: 'session_id and entries required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        const { learner_id, status, note } = entry || {};
        if (!learner_id || !status) continue;
        await client.query(
          `INSERT INTO org_attendance_entries (session_id, learner_id, status, note, updated_at)
           VALUES ($1,$2,$3,$4, now())
           ON CONFLICT (session_id, learner_id)
           DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, updated_at = now()`,
          [session_id, learner_id, status, note || null],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to save attendance' });
  }
}

export async function getAttendanceReport(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { start, end, class_label } = req.query;

    const { rows } = await pool.query(
      `SELECT s.id as session_id, s.session_date, s.class_label, s.period_label,
              json_agg(
                json_build_object('learner_id', e.learner_id, 'status', e.status, 'note', e.note)
              ) FILTER (WHERE e.id IS NOT NULL) as entries
       FROM org_attendance_sessions s
       LEFT JOIN org_attendance_entries e ON e.session_id = s.id
       WHERE s.org_id = $1
         AND ($2::date IS NULL OR s.session_date >= $2)
         AND ($3::date IS NULL OR s.session_date <= $3)
         AND ($4::text IS NULL OR s.class_label = $4)
       GROUP BY s.id
       ORDER BY s.session_date DESC
       LIMIT 200`,
      [orgId, start || null, end || null, class_label || null],
    );

    const summary = rows.reduce(
      (acc, row) => {
        for (const ent of row.entries || []) {
          acc[ent.status] = (acc[ent.status] || 0) + 1;
        }
        return acc;
      },
      {},
    );

    res.json({ sessions: rows, summary });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load attendance' });
  }
}

// ───────────────────────── Fees & balances ─────────────────────────
export async function createFeeCharge(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { learner_id, amount_cents, currency = 'USD', description, class_label, due_date } =
      req.body || {};
    if (!learner_id || !amount_cents) {
      return res.status(400).json({ message: 'learner_id and amount_cents required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO org_fee_charges (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        orgId,
        learner_id,
        amount_cents,
        currency,
        description || null,
        class_label || null,
        due_date || null,
        req.user?.id ?? null,
      ],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to create fee charge' });
  }
}

export async function bulkFeeCharges(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { learner_ids, amount_cents, currency = 'USD', description, class_label, due_date } =
      req.body || {};
    if (!Array.isArray(learner_ids) || !amount_cents) {
      return res.status(400).json({ message: 'learner_ids[] and amount_cents required' });
    }
    const inserted = [];
    for (const learnerId of learner_ids) {
      const { rows } = await pool.query(
        `INSERT INTO org_fee_charges (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          orgId,
          learnerId,
          amount_cents,
          currency,
          description || null,
          class_label || null,
          due_date || null,
          req.user?.id ?? null,
        ],
      );
      inserted.push(rows[0]);
    }
    res.json({ inserted });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to create bulk charges' });
  }
}

export async function recordFeePayment(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { learner_id, amount_cents, currency = 'USD', method, reference, note, received_at } =
      req.body || {};
    if (!learner_id || !amount_cents) {
      return res.status(400).json({ message: 'learner_id and amount_cents required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO org_fee_payments (org_id, learner_id, amount_cents, currency, method, reference, note, received_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        orgId,
        learner_id,
        amount_cents,
        currency,
        method || null,
        reference || null,
        note || null,
        received_at || null,
        req.user?.id ?? null,
      ],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to record payment' });
  }
}

export async function getFeeBalances(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { rows } = await pool.query(
      `SELECT learner_id,
              COALESCE(SUM(ch.amount_cents),0) AS charges,
              COALESCE((SELECT SUM(p.amount_cents) FROM org_fee_payments p WHERE p.org_id = ch.org_id AND p.learner_id = ch.learner_id),0) AS payments
       FROM org_fee_charges ch
       WHERE ch.org_id = $1
       GROUP BY learner_id`,
      [orgId],
    );

    const balances = rows.map((r) => ({
      learner_id: r.learner_id,
      charges: Number(r.charges || 0),
      payments: Number(r.payments || 0),
      balance: Number(r.charges || 0) - Number(r.payments || 0),
    }));

    res.json({ balances });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load balances' });
  }
}

export async function getFeeStatement(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const learnerId = req.params.learnerId || req.query.learner_id;
    if (!learnerId) return res.status(400).json({ message: 'learnerId required' });

    const charges = await pool.query(
      `SELECT id, amount_cents, currency, description, class_label, due_date, created_at
       FROM org_fee_charges
       WHERE org_id = $1 AND learner_id = $2
       ORDER BY created_at DESC`,
      [orgId, learnerId],
    );

    const payments = await pool.query(
      `SELECT id, amount_cents, currency, method, reference, note, received_at, created_at
       FROM org_fee_payments
       WHERE org_id = $1 AND learner_id = $2
       ORDER BY received_at DESC NULLS LAST`,
      [orgId, learnerId],
    );

    const totalCharges = charges.rows.reduce((acc, c) => acc + Number(c.amount_cents || 0), 0);
    const totalPayments = payments.rows.reduce((acc, p) => acc + Number(p.amount_cents || 0), 0);

    res.json({
      charges: charges.rows,
      payments: payments.rows,
      balance: totalCharges - totalPayments,
    });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load statement' });
  }
}

// ───────────────────────── Newsletters ─────────────────────────
function buildNewsletterDraft(termLabel, title) {
  const safeTerm = termLabel || 'the term';
  return `# ${title || 'Newsletter'}\n\nWelcome to ${safeTerm}!\n\n- Highlights\n- Upcoming events\n- Celebrations`; // minimal template
}

export async function createNewsletter(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { term_label, title } = req.body || {};
    if (!title) return res.status(400).json({ message: 'title required' });
    const content_md = buildNewsletterDraft(term_label, title);
    const { rows } = await pool.query(
      `INSERT INTO org_newsletters (org_id, term_label, title, content_md, status, created_by)
       VALUES ($1,$2,$3,$4,'draft',$5)
       RETURNING *`,
      [orgId, term_label || null, title, content_md, req.user?.id ?? null],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to create newsletter' });
  }
}

export async function generateNewsletterContent(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { term_label, title, notes } = req.body || {};
    const content_md = `${buildNewsletterDraft(term_label, title)}\n\n${notes || ''}`;
    res.json({ content_md });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to generate content' });
  }
}

export async function saveNewsletterContent(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { id } = req.params;
    const { content_md, title, term_label, status } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE org_newsletters
       SET content_md = COALESCE($1, content_md),
           title = COALESCE($2, title),
           term_label = COALESCE($3, term_label),
           status = COALESCE($4, status),
           updated_at = now()
       WHERE id = $5 AND org_id = $6
       RETURNING *`,
      [content_md || null, title || null, term_label || null, status || null, id, orgId],
    );
    if (!rows.length) return res.status(404).json({ message: 'Newsletter not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to save newsletter' });
  }
}

export async function sendNewsletter(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { id } = req.params;
    const { recipients = [] } = req.body || {};

    const { rows } = await pool.query(
      `UPDATE org_newsletters
       SET status = 'sent', sent_at = now(), updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, orgId],
    );
    if (!rows.length) return res.status(404).json({ message: 'Newsletter not found' });

    for (const email of recipients) {
      await pool.query(
        `INSERT INTO org_newsletter_recipients (newsletter_id, recipient_email, delivered)
         VALUES ($1,$2,true)
         ON CONFLICT DO NOTHING`,
        [id, email],
      );
    }

    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to send newsletter' });
  }
}

export async function listNewsletters(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { rows } = await pool.query(
      `SELECT * FROM org_newsletters WHERE org_id = $1 ORDER BY updated_at DESC LIMIT 200`,
      [orgId],
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to list newsletters' });
  }
}

// ───────────────────────── Announcements ─────────────────────────
export async function createAnnouncement(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const { audience = 'all', title, body, pinned = false, start_at, end_at } = req.body || {};
    if (!title || !body) return res.status(400).json({ message: 'title and body required' });
    const { rows } = await pool.query(
      `INSERT INTO org_announcements (org_id, author_id, audience, title, body, pinned, start_at, end_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [orgId, req.user?.id ?? null, audience, title, body, pinned, start_at || null, end_at || null],
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to post announcement' });
  }
}

export async function listAnnouncements(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);
    const audience = req.query.audience || 'all';
    const { rows } = await pool.query(
      `SELECT *
       FROM org_announcements
       WHERE org_id = $1
         AND (audience = 'all' OR audience = $2)
         AND (start_at IS NULL OR start_at <= now())
         AND (end_at IS NULL OR end_at >= now())
       ORDER BY pinned DESC, created_at DESC
       LIMIT 100`,
      [orgId, audience],
    );
    res.json({ items: rows });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load announcements' });
  }
}
