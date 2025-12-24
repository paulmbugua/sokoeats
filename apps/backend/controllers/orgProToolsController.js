import pool from '../config/db.js';
import { v2 as cloudinary } from 'cloudinary';
import { requireOrgTier } from '../utils/orgTierGuard.js';
import { sendNotification } from '../utils/sendNotification.js';
import {
  generateNewsletterDraftAI,
  newsletterDraftToMarkdown,
} from '../services/newsletterAiService.js';
import { buildNewsletterEmailHtml } from '../services/newsletterEmailTemplate.js';

const PRO_ONLY = ['pro', 'enterprise'];

function normalizeOrgId(req) {
  return req.params.orgId || req.params.org_id || req.body.org_id;
}

function normEmail(s) {
  const v = String(s || '').trim().toLowerCase();
  if (!v) return null;
  if (!v.includes('@')) return null;
  return v;
}

function stripPdfDataUrl(b64) {
  const s = String(b64 || '');
  return s.replace(/^data:application\/pdf;base64,/i, '').trim();
}

function safePdfFilename(newsletterTitle) {
  return `${String(newsletterTitle || 'newsletter')
    .trim()
    .replace(/[^\w\d-_]+/g, '_')
    .slice(0, 60)}.pdf`;
}

function uploadPdfBuf({ buffer, public_id, folder = 'org_newsletters' }) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      {
        public_id: `${folder}/${public_id}`,
        resource_type: 'raw',   // ✅ PDFs go as raw
        overwrite: true,
        type: 'upload',
        format: 'pdf',
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    upload.end(buffer);
  });
}

async function listLearnerTargets(orgId, classLabel) {
  const params = [orgId];
  let where = `olp.org_id = $1`;

  if (classLabel) {
    params.push(String(classLabel).trim());
    // ✅ case-insensitive + trimmed match (reduces "Class 4" vs "class 4 " issues)
    where += ` AND lower(btrim(coalesce(olp.class_label,''))) = lower(btrim($2))`;
  }

  const { rows } = await pool.query(
    `
    SELECT
      olp.user_id,
      olp.class_label,
      olp.admission_code,
      lower(trim(coalesce(u.email, olp.guardian_email))) AS email
    FROM org_learner_profiles olp
    LEFT JOIN users u ON u.id = olp.user_id
    WHERE ${where}
    `,
    params,
  );

  return rows.filter((r) => r.user_id);
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

    const summary = rows.reduce((acc, row) => {
      for (const ent of row.entries || []) {
        acc[ent.status] = (acc[ent.status] || 0) + 1;
      }
      return acc;
    }, {});

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
  const client = await pool.connect();
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const {
      learner_ids,
      amount_cents,
      currency = 'USD',
      description,
      class_label,
      due_date,
    } = req.body || {};

    if (!Array.isArray(learner_ids) || learner_ids.length === 0 || !amount_cents) {
      return res.status(400).json({ message: 'learner_ids[] and amount_cents required' });
    }

    const ids = learner_ids
      .map((x) => String(x || '').trim())
      .filter((x) => x && x !== 'undefined' && x !== 'null');

    if (ids.length === 0) {
      return res.status(400).json({ message: 'No valid learner_ids provided' });
    }

    const inserted = [];
    const failed = [];

    await client.query('BEGIN');

    for (const learnerId of ids) {
      try {
        const { rows } = await client.query(
          `INSERT INTO org_fee_charges
             (org_id, learner_id, amount_cents, currency, description, class_label, due_date, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING *`,
          [
            orgId,
            learnerId,
            Number(amount_cents),
            currency,
            description || null,
            class_label || null,
            due_date || null,
            req.user?.id ?? null,
          ],
        );

        inserted.push(rows[0]);
      } catch (err) {
        failed.push({
          learner_id: learnerId,
          reason: err?.message || 'insert failed',
        });
      }
    }

    await client.query('COMMIT');
    return res.json({ inserted, failed });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error('[bulkFeeCharges] error', e);
    return res.status(e.status || 500).json({ message: e.message || 'Unable to create bulk charges' });
  } finally {
    client.release();
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

// ───────────────────────── Newsletters ─────────────────────────
function buildNewsletterDraft(termLabel, title, orgName) {
  const safeTerm = termLabel || 'the term';
  const safeOrg = orgName || 'our school';

  // Creative + still simple + readable in plain email
  return (
`# ${title || 'End of Term Newsletter'}

Hello families,

Thank you for supporting ${safeOrg} throughout **${safeTerm}**.

## 🌟 Highlights
- Academic progress & learning moments
- Character wins and classroom celebrations
- Clubs, sports and special activities

## 📌 Important reminders
- Fees & balances: please clear outstanding balances where possible
- Uniform / materials: check what to prepare for next term
- Contact: reply to this email if you need help

## 📅 What’s next
- Term break dates
- Re-opening date
- Upcoming events

Warm regards,  
${safeOrg}`
  );
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
    console.error('[createNewsletter] error:', e); // ✅ IMPORTANT
    res.status(e?.status || 500).json({
      message: e?.message || 'Unable to create newsletter',
      code: e?.code || null,
    });
  }
}
   

export async function generateNewsletterContent(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { term_label, title, notes, tone } = req.body || {};

    const orgRes = await pool.query(
      `SELECT name FROM organizations WHERE id = $1 LIMIT 1`,
      [orgId],
    );
    const orgName = orgRes.rows[0]?.name || 'our school';

    // Try AI first
    try {
      const draft = await generateNewsletterDraftAI({
        orgName,
        termLabel: term_label,
        title,
        notes,
        tone, // optional
        audience: 'Parents/Guardians',
      });

     const content_md = newsletterDraftToMarkdown(draft, {
        orgName,
        termLabel: term_label,
      });

            return res.json({
        titleSuggestion: draft.titleSuggestion,
        sections: draft.sections,
        closing: draft.closing,
        content_md,
      });
    } catch (aiErr) {
      // Fall back to your original template if AI fails/unavailable
      const base = buildNewsletterDraft(term_label, title, orgName);
      const content_md = base;


      return res.json({
        titleSuggestion: title || 'End of Term Newsletter',
        sections: [
          {
            heading: 'Highlights',
            bullets: [
              'Academic progress & learning moments',
              'Character wins and classroom celebrations',
              'Clubs, sports and special activities',
            ],
          },
          {
            heading: 'Important reminders',
            bullets: [
              'Fees & balances: please clear outstanding balances where possible',
              'Uniform / materials: check what to prepare for next term',
              'Contact: reply to this email if you need help',
            ],
          },
          {
            heading: "What's next",
            bullets: ['Term break dates', 'Re-opening date', 'Upcoming events'],
          },
        ],
        closing: `Warm regards,\n${orgName}`,
        content_md,
        ai_fallback: true,
        ai_error: aiErr?.message || 'AI unavailable',
      });
    }
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ message: e.message || 'Unable to generate content' });
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

export async function getNewsletter(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT * FROM org_newsletters WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [orgId, id],
    );
    if (!rows.length) return res.status(404).json({ message: 'Newsletter not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load newsletter' });
  }
}

export async function previewNewsletterRecipients(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { mode = 'all', class_label, recipients = [], channel = 'in_app' } = req.body || {};

    const ch = String(channel || 'in_app').toLowerCase();
    const wantsInApp = ch === 'in_app' || ch === 'both';
    const wantsEmail = ch === 'email' || ch === 'both';

    let learnerTargets = [];
    let emails = [];

    if (mode === 'custom') {
      emails = (recipients || []).map(normEmail).filter(Boolean);
      return res.json({
        count: emails.length,
        sample: emails.slice(0, 20),
        emails: emails.length,
        email_sample: emails.slice(0, 20),
        learners: 0,
        learner_sample: [],
      });
    }

    if (mode === 'class') {
      const cls = String(class_label || '').trim();
      if (!cls) return res.status(400).json({ message: 'class_label required for class mode' });

      learnerTargets = await listLearnerTargets(orgId, cls);
    } else {
      learnerTargets = await listLearnerTargets(orgId, null);
    }

    if (wantsEmail) {
      emails = learnerTargets.map((x) => normEmail(x.email)).filter(Boolean);
    }

    // ✅ sample admissions for in-app preview (what you want to see)
    const learnerSample = learnerTargets
      .map((x) => String(x.admission_code || x.user_id || '').trim())
      .filter(Boolean)
      .slice(0, 20);

    // ✅ keep UI simple: "count/sample" always work
    return res.json({
      count: wantsInApp ? learnerTargets.length : emails.length,
      sample: wantsInApp ? learnerSample : emails.slice(0, 20),

      // extra debug fields (optional but helpful)
      learners: learnerTargets.length,
      learner_sample: learnerSample,
      emails: emails.length,
      email_sample: emails.slice(0, 20),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Unable to preview recipients' });
  }
}


export async function listNewsletterRecipients(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { id } = req.params;

    // ensure belongs to org
    const chk = await pool.query(
      `SELECT id FROM org_newsletters WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [orgId, id],
    );
    if (!chk.rows.length) return res.status(404).json({ message: 'Newsletter not found' });

    const { rows } = await pool.query(
      `SELECT recipient_email, delivered, delivered_at, error, created_at
       FROM org_newsletter_recipients
       WHERE newsletter_id = $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [id],
    );

    const summary = rows.reduce(
      (acc, r) => {
        acc.total += 1;
        if (r.delivered) acc.delivered += 1;
        else acc.failed += 1;
        return acc;
      },
      { total: 0, delivered: 0, failed: 0 },
    );

    res.json({ items: rows, summary });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to load recipients' });
  }
}

function stripThemeFromContent(md = '') {
  return String(md || '').replace(/^\s*<!--THEME[\s\S]*?-->\s*/i, '').trim();
}

export async function sendNewsletter(req, res) {
  const client = await pool.connect();
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { id } = req.params;
    const {
      mode = 'all',
      class_label,
      recipients = [],
      channel = 'in_app',
      pdf_base64 = null, // ✅ add this
    } = req.body || {};

    const ch = String(channel || 'in_app').toLowerCase();
    const wantsInApp = ch === 'in_app' || ch === 'both';
    const wantsEmail = ch === 'email' || ch === 'both';

    const nRes = await client.query(
      `SELECT * FROM org_newsletters WHERE org_id = $1 AND id = $2 LIMIT 1`,
      [orgId, id],
    );
    if (!nRes.rows.length) return res.status(404).json({ message: 'Newsletter not found' });
    const newsletter = nRes.rows[0];

    let learnerTargets = [];
    let emails = [];

    if (mode === 'custom') {
      emails = (recipients || []).map(normEmail).filter(Boolean);
    } else if (mode === 'class') {
      const cls = String(class_label || '').trim();
      if (!cls) return res.status(400).json({ message: 'class_label required for class mode' });
      learnerTargets = await listLearnerTargets(orgId, cls);
      if (wantsEmail) emails = learnerTargets.map((x) => normEmail(x.email)).filter(Boolean);
    } else {
      learnerTargets = await listLearnerTargets(orgId, null);
      if (wantsEmail) emails = learnerTargets.map((x) => normEmail(x.email)).filter(Boolean);
    }

    if (!wantsInApp && wantsEmail && emails.length === 0) {
      return res.status(400).json({ message: 'No email recipients found' });
    }
    if (!wantsInApp && !wantsEmail) {
      return res.status(400).json({ message: 'Invalid channel' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE org_newsletters
         SET status = 'sending',
             updated_at = now(),
             sent_at = COALESCE(sent_at, now()),
             class_label = $3,
             target_mode = $4
       WHERE id = $1 AND org_id = $2`,
      [
        id,
        orgId,
        mode === 'class' ? String(class_label || '').trim() : null,
        mode,
      ],
    );

    await client.query('COMMIT');

    const safePdfBase64 =
      pdf_base64 && typeof pdf_base64 === 'string' && pdf_base64.length > 50
        ? pdf_base64
        : null;

    // ✅ UPDATED: cloud-first PDF persistence (Cloudinary → DB fallback)
    let pdfBytes = null;
    let pdfFilename = null;

    if (safePdfBase64) {
      const clean = stripPdfDataUrl(safePdfBase64);
      pdfBytes = Buffer.from(clean, 'base64');

      const MAX = 8 * 1024 * 1024; // 8MB
      if (pdfBytes.length > MAX) {
        return res.status(413).json({ message: 'PDF too large (max 8MB)' });
      }

      pdfFilename = safePdfFilename(newsletter.title);

      // ✅ Upload to Cloudinary "Newsletter Vault"
      let pdfUrl = null;
      let pdfPublicId = null;

      try {
        const publicId = `${orgId}/${id}`; // predictable + grouped by org
        const up = await uploadPdfBuf({
          buffer: pdfBytes,
          public_id: publicId,
          folder: 'org_newsletters',
        });

        pdfUrl = up?.secure_url || null;
        pdfPublicId = up?.public_id || `org_newsletters/${publicId}`;
      } catch (e) {
        console.warn('[sendNewsletter] cloud upload failed, fallback to DB bytes:', e?.message);
      }

      // ✅ Persist for learner portal (prefer URL, fallback bytes)
      await client.query(
        `UPDATE org_newsletters
           SET pdf_url = COALESCE($3, pdf_url),
               pdf_public_id = COALESCE($4, pdf_public_id),
               pdf_filename = COALESCE($5, pdf_filename),
               pdf_uploaded_at = now(),
               updated_at = now(),
               pdf_bytes = CASE WHEN $3 IS NOT NULL THEN NULL ELSE $6 END
         WHERE id = $1 AND org_id = $2`,
        [id, orgId, pdfUrl, pdfPublicId, pdfFilename, pdfUrl ? null : pdfBytes],
      );
    }

    // EMAIL: branded HTML + plain fallback
    if (wantsEmail && emails.length) {
      const orgRes = await client.query(
        `SELECT name, logo_url, signature_url, address_line1, address_line2, phone_number, contact_email, website_url
         FROM organizations WHERE id=$1 LIMIT 1`,
        [orgId],
      );
      const orgRow = orgRes.rows[0] || {};

      const subject = `${newsletter.title}`;
      const text = stripThemeFromContent(newsletter.content_md || '');

      const html = buildNewsletterEmailHtml({
        org: orgRow,
        newsletter,
        principalLabel: 'Head teacher / Principal',
      });

      for (const email of emails) {
        let delivered = false;
        let error = null;

        try {
          await sendNotification({
            to: email,
            subject,
            text,
            html,
            attachments: pdfBytes
              ? [
                  {
                    filename: pdfFilename,
                    content: pdfBytes, // ✅ Buffer
                    contentType: 'application/pdf',
                  },
                ]
              : [],
          });

          delivered = true;
        } catch (e) {
          delivered = false;
          error = e?.message || 'send failed';
        }

        await client.query(
          `INSERT INTO org_newsletter_recipients
             (newsletter_id, recipient_email, delivered, delivered_at, error)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (newsletter_id, recipient_email)
           DO UPDATE SET
             delivered = EXCLUDED.delivered,
             delivered_at = EXCLUDED.delivered_at,
             error = EXCLUDED.error`,
          [id, email, delivered, delivered ? new Date() : null, delivered ? null : error],
        );
      }
    }

    const { rows } = await pool.query(
      `UPDATE org_newsletters
         SET status = 'sent',
             sent_at = now(),
             updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, orgId],
    );

    return res.json({
      newsletter: rows[0],
      in_app_recipients: wantsInApp ? learnerTargets.length : 0,
      emailed: wantsEmail ? emails.length : 0,
    });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    return res
      .status(e.status || 500)
      .json({ message: e.message || 'Unable to send newsletter' });
  } finally {
    client.release();
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

export async function listLearnerNewsletters(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const lp = await pool.query(
      `SELECT class_label
       FROM org_learner_profiles
       WHERE org_id = $1 AND user_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [orgId, userId],
    );

    const classLabel = lp.rows[0]?.class_label || null;

    // If learner has no class label, they can still see "all" newsletters
   const { rows } = await pool.query(
  `SELECT id, title, term_label, sent_at, updated_at, class_label, target_mode,
          (pdf_url IS NOT NULL OR pdf_bytes IS NOT NULL) AS has_pdf
   FROM org_newsletters
   WHERE org_id = $1
     AND status = 'sent'
     AND (
       target_mode = 'all'
       OR (
         $2::text IS NOT NULL
         AND target_mode = 'class'
         AND lower(btrim(class_label)) = lower(btrim($2))
       )
     )
   ORDER BY sent_at DESC NULLS LAST, updated_at DESC
   LIMIT 20`,
  [orgId, classLabel],
);


    return res.json({ items: rows });
  } catch (e) {
    return res
      .status(e.status || 500)
      .json({ message: e.message || 'Unable to load newsletters' });
  }
}


export async function getLearnerNewsletter(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const lp = await pool.query(
      `SELECT class_label
       FROM org_learner_profiles
       WHERE org_id = $1 AND user_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [orgId, userId],
    );

    const classLabel = lp.rows[0]?.class_label || null;

    const { rows } = await pool.query(
  `SELECT id, title, term_label, content_md, sent_at, updated_at, class_label, target_mode,
           (pdf_url IS NOT NULL OR pdf_bytes IS NOT NULL) AS has_pdf,
          pdf_filename
   FROM org_newsletters
   WHERE org_id = $1
     AND id = $2
     AND status = 'sent'
     AND (
       target_mode = 'all'
       OR (
         $3::text IS NOT NULL
         AND target_mode = 'class'
         AND lower(btrim(class_label)) = lower(btrim($3))
       )
     )
   LIMIT 1`,
  [orgId, id, classLabel],
);



    if (!rows.length) return res.status(404).json({ message: 'Newsletter not found' });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Unable to load newsletter' });
  }
}

export async function listOrgClassLabels(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const { rows } = await pool.query(
      `SELECT
         class_label,
         COUNT(*) AS learners,
         COUNT(*) FILTER (WHERE guardian_email IS NOT NULL AND btrim(guardian_email) <> '') AS with_emails
       FROM org_learner_profiles
       WHERE org_id = $1
         AND class_label IS NOT NULL
         AND btrim(class_label) <> ''
       GROUP BY class_label
       ORDER BY learners DESC, class_label ASC
       LIMIT 200`,
      [orgId],
    );

    res.json({ items: rows });
  } catch (e) {
    res.status(e.status || 500).json({ message: e.message || 'Unable to list class labels' });
  }
}


export async function getLearnerNewsletterPdf(req, res) {
  try {
    const orgId = normalizeOrgId(req);
    await requireOrgTier(orgId, PRO_ONLY);

    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const { id } = req.params;

    const lp = await pool.query(
      `SELECT class_label
       FROM org_learner_profiles
       WHERE org_id = $1 AND user_id = $2
       ORDER BY updated_at DESC
       LIMIT 1`,
      [orgId, userId],
    );

    const classLabel = lp.rows[0]?.class_label || null;

    const { rows } = await pool.query(
      `SELECT title, pdf_bytes, pdf_url, pdf_filename, target_mode, class_label
       FROM org_newsletters
       WHERE org_id = $1
         AND id = $2
         AND status = 'sent'
         AND (
           target_mode = 'all'
           OR (
             $3::text IS NOT NULL
             AND target_mode = 'class'
             AND lower(btrim(class_label)) = lower(btrim($3))
           )
         )
       LIMIT 1`,
      [orgId, id, classLabel],
    );

    if (!rows.length) return res.status(404).json({ message: 'PDF not found' });

    const row = rows[0];
    const filename = row.pdf_filename || safePdfFilename(row.title);

    // 1) If stored in DB (fallback path)
    if (row.pdf_bytes) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(row.pdf_bytes);
    }

    // 2) If stored in Cloudinary (preferred path)
    if (row.pdf_url) {
      const r = await fetch(row.pdf_url);
      if (!r.ok) {
        return res.status(502).json({ message: 'Unable to fetch PDF from storage' });
      }

      const ab = await r.arrayBuffer();
      const buf = Buffer.from(ab);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.send(buf);
    }

    return res.status(404).json({ message: 'PDF not found' });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message || 'Unable to load PDF' });
  }
}
