// apps/backend/controllers/adminController.js
import axios from 'axios';                 // NEW (for Cloudinary fetch)
import pool from '../config/db.js';
import jwt from 'jsonwebtoken';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';               // NEW (for QR verification block)
import { v2 as cloudinary } from 'cloudinary'; // NEW (for signed token retry)
import fetch from 'node-fetch';
import { sendOTP } from '../config/emailService.js';

const createToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
/* ----------------------------- PACKAGES ----------------------------- */
/**
 * Create/Update a package **pair** (USD + KES) for the same credits/offer.
 * Body: { credits:number, priceUSD:number, priceKES:number, offer?:string }
 * Returns the two rows.
 */

/** Cloud name from env (supports both names) */
// Ensure Cloudinary uses https and can read CLOUDINARY_URL if set
cloudinary.config({ secure: true });

// Small helper to trim env values
const _pick = (v) => (v ?? '').toString().trim();

// Resolve & TRIM cloud name (fixes 'dc2saanpb ' bug)
const CLOUDINARY_CLOUD_NAME = _pick(
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_NAME ||
  (cloudinary.config() || {}).cloud_name ||
  ''
);

// (Optional) pre-trimmed public IDs if you want to use them directly
const RECEIPT_LOGO_ID      = _pick(process.env.RECEIPT_LOGO_PUBLIC_ID || 'branding/logo');
const RECEIPT_SIGNATURE_ID = _pick(process.env.RECEIPT_SIGNATURE_PUBLIC_ID || 'branding/signature');


/** Try fetch → if 401 and Cloudinary api_secret is set, retry with short-lived token */
async function fetchBufferWithSignedRetry(url, { responseType = 'arraybuffer', timeout = 6000 } = {}) {
  const tryFetch = async (theUrl) =>
    axios.get(theUrl, { responseType, timeout, validateStatus: () => true });

  const first = await tryFetch(url);
  if (first.status === 200) return Buffer.from(first.data);

  if (first.status === 401 || first.status === 403) {
    const cfg = cloudinary.config() || {};
    if (cfg?.api_secret) {
      // Broad ACL so transforms/versions still match
      const token = cloudinary.utils.generate_auth_token({
        start_time: Math.floor(Date.now() / 1000) - 30,
        duration: 300,
        acl: ['/image/upload/*'],
      });
      const sep = url.includes('?') ? '&' : '?';
      const signedUrl = `${url}${sep}__cld_token__=${token}`;
      const second = await tryFetch(signedUrl);
      if (second.status === 200) return Buffer.from(second.data);
    }
  }

  const xerr = first.headers?.['x-cld-error'];
  console.warn('[receipt] fetchBufferWithSignedRetry failed', {
    status: first.status,
    x_cld_error: xerr,
    url,
  });
  return null;
}

/** Fetch Cloudinary image as PNG buffer for embedding into PDF (optional resize) */
// update helper
async function fetchCloudinaryAsPngBuffer(publicId, { w, h, q = 'auto', trim = false } = {}) {
  if (!publicId) return null;

  if (!CLOUDINARY_CLOUD_NAME) {
    console.warn('[receipt] No cloud name available. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME.');
    return null;
  }

  // Sanitize the public ID: trim, remove leading slashes and trailing file extensions
  const cleanPublicId = String(publicId)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\.(png|jpg|jpeg|gif|svg|webp)$/i, '');

  const parts = [];
  if (trim) parts.push('e_trim');         // trim first
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  parts.push('c_limit', `q_${q}`, 'f_png'); // force PNG output
  const transform = parts.join(',');

  // NOTE: do NOT append ".png" to the public ID; 'f_png' handles output format
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transform}/${cleanPublicId}`;

  try {
    return await fetchBufferWithSignedRetry(url, { responseType: 'arraybuffer', timeout: 6000 });
  } catch (e) {
    console.warn('[receipt] Cloudinary fetch failed:', { status: e?.response?.status, msg: e?.message, url });
    return null;
  }
}



/** Soft background + border */
function drawBackdrop(doc) {
  const { width, height } = doc.page;
  // Top band
  doc.save();
  doc.fillColor('#F5F3FF').rect(0, 0, width, 105).fill();
  doc.restore();

  // Subtle border
  doc.save();
  doc.lineWidth(1.6).strokeColor('#E5E7EB');
  doc.roundedRect(32, 32, width - 64, height - 64, 10).stroke();
  doc.restore();
}

/** Watermark */
function drawWatermark(doc, text) {
  if (!text) return;
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2 + 12;
  doc.save();
  doc.opacity(0.1).fillColor('#111827');
  doc.rotate(-18, { origin: [cx, cy] });
  doc.font('Helvetica-Bold').fontSize(84).text(text, cx - 240, cy - 44, { width: 480, align: 'center' });
  doc.restore();
}

function money(cur, amt) {
  const n = Number(amt || 0);
  return `${cur} ${n.toFixed(2)}`;
}
 

export async function upsertPackagePair(req, res) {
  try {
    const rawCredits = req.body?.credits;
    const credits = Number(rawCredits);

    if (!Number.isFinite(credits) || credits <= 0 || !Number.isInteger(credits)) {
      return res.status(400).json({ success: false, message: 'credits must be a positive integer' });
    }

    const usd = Number(req.body?.priceUSD);
    const kes = Number(req.body?.priceKES);

    // At least one price must be provided (and non-negative)
    const hasUsd = Number.isFinite(usd);
    const hasKes = Number.isFinite(kes);
    if (!hasUsd && !hasKes) {
      return res.status(400).json({ success: false, message: 'At least one price required (USD or KES)' });
    }
    if (hasUsd && usd < 0) {
      return res.status(400).json({ success: false, message: 'priceUSD must be >= 0' });
    }
    if (hasKes && kes < 0) {
      return res.status(400).json({ success: false, message: 'priceKES must be >= 0' });
    }

    // Normalize offer: use '' when empty so it’s safe even if DB column is NOT NULL
    const cleanOffer =
      typeof req.body?.offer === 'string' ? req.body.offer.trim() : '';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const resultRows = [];

      // Single currency UPSERT helper
      async function upsertCurrency(currency, price) {
        if (!Number.isFinite(price)) return null; // skip missing price

        const sql = `
          INSERT INTO packages (credits, price, currency, offer)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (credits, currency)
          DO UPDATE SET
            price = EXCLUDED.price,
            offer = EXCLUDED.offer
          -- Only update when something actually changed (prevents needless updated_at bumps)
          WHERE
            packages.price IS DISTINCT FROM EXCLUDED.price
            OR packages.offer IS DISTINCT FROM EXCLUDED.offer
          RETURNING *;
        `;
        const params = [credits, price, currency, cleanOffer];
        const { rows } = await client.query(sql, params);
        return rows[0] || null;
      }

      const usdRow = await upsertCurrency('USD', usd);
      if (usdRow) resultRows.push(usdRow);

      const kesRow = await upsertCurrency('KES', kes);
      if (kesRow) resultRows.push(kesRow);

      await client.query('COMMIT');
      return res.json({ success: true, packages: resultRows });
    } catch (e) {
      await client.query('ROLLBACK');
      console.error('[admin][upsertPackagePair] tx error', e);
      return res.status(500).json({ success: false, message: e?.message || 'Failed to save package pair' });
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[admin][upsertPackagePair]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/** List packages (optionally filter by ?currency=USD|KES). */
export async function listPackages(req, res) {
  try {
    const q = String(req.query.currency || '').toUpperCase();
    const isCurrencyFilter = q === 'USD' || q === 'KES';

    const params = [];
    let sql = `
      SELECT id, credits, price, currency, offer
      FROM packages
      ${isCurrencyFilter ? 'WHERE currency = $1' : ''}
      ORDER BY credits ASC, currency ASC, id ASC
    `;
    if (isCurrencyFilter) params.push(q);

    const { rows } = await pool.query(sql, params);
    return res.json({ success: true, packages: rows });
  } catch (err) {
    console.error('[admin][listPackages] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/** Update a single package row by id. Body can include { price, offer, credits }. */
export async function updatePackage(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ success: false, message: 'Invalid id' });

    const { price, offer, credits } = req.body || {};
    const fields = [];
    const values = [];
    let idx = 1;

    if (price != null) {
      fields.push(`price = $${idx++}`);
      values.push(Number(price));
    }
    if (offer !== undefined) {
      fields.push(`offer = $${idx++}`);
      values.push(offer || null);
    }
    if (credits != null) {
      fields.push(`credits = $${idx++}`);
      values.push(Number(credits));
    }

    if (!fields.length) return res.status(400).json({ success: false, message: 'No fields to update' });

    const { rows } = await pool.query(
      `UPDATE packages SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${idx} RETURNING *`,
      [...values, id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Package not found' });
    return res.json({ success: true, package: rows[0] });
  } catch (err) {
    console.error('[admin][updatePackage]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}



/* -------------------------- TRANSACTIONS --------------------------- */
/**
 * Admin list of payments joined with users and packages.
 * Filters:
 *  - ?limit=100
 *  - ?method=paypal|mpesa
 *  - ?status=Pending|Completed|Failed
 *  - ?email=foo@bar.com (matches user_email or payer_email)
 *  - ?currency=USD|KES
 *  - ?since=2025-09-01T00:00:00Z  ?until=2025-09-07T00:00:00Z
 *  - ?q=free text across order/capture/mpesa/email
 */
export async function listTransactions(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);

    const where = [];
    const params = [];
    let i = 1;

    // method filter
    if (req.query.method) {
      where.push(`LOWER(p.payment_method) = $${i++}`);
      params.push(String(req.query.method).toLowerCase() === 'mpesa' ? 'mpesa' : 'paypal');
    }

    // status filter
    if (req.query.status) {
      where.push(`LOWER(p.status) = $${i++}`);
      params.push(String(req.query.status).toLowerCase());
    }

    // email filter (matches user or payer)
    if (req.query.email) {
      where.push(`(LOWER(u.email) = $${i} OR LOWER(COALESCE(p.payer_email,'')) = $${i})`);
      params.push(String(req.query.email).toLowerCase());
      i++;
    }

    // currency filter
    if (req.query.currency) {
      where.push(`UPPER(p.currency) = $${i++}`);
      params.push(String(req.query.currency).toUpperCase());
    }

    // since/until (created_at) — guard invalid dates
    const tryDate = (v) => {
      const d = new Date(String(v));
      return isNaN(+d) ? null : d;
    };
    const since = tryDate(req.query.since);
    const until = tryDate(req.query.until);
    if (since) {
      where.push(`p.created_at >= $${i++}`);
      params.push(since);
    }
    if (until) {
      where.push(`p.created_at < $${i++}`);
      params.push(until);
    }

    // quick search q
    if (req.query.q) {
      const q = `%${String(req.query.q).toLowerCase()}%`;
      where.push(
        `(LOWER(u.email) LIKE $${i}
          OR LOWER(COALESCE(p.payer_email,''))     LIKE $${i}
          OR LOWER(COALESCE(p.transaction_id,''))  LIKE $${i}
          OR LOWER(COALESCE(p.capture_id,''))      LIKE $${i}
          OR LOWER(COALESCE(p.mpesa_reference,'')) LIKE $${i})`
      );
      params.push(q);
      i++;
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
  `
  SELECT
    p.id,
    p.user_id,
    u.email AS user_email,
    u.name  AS user_name,

    -- money & status
    p.amount,
    p.currency,
    p.status,

    -- methods and providers
    p.payment_method,
    COALESCE(NULLIF(p.method,''), p.payment_method) AS method,
    NULLIF(p.provider,'') AS provider,
    NULLIF(p.provider_order_id,'') AS provider_order_id,
    NULLIF(p.intent,'') AS intent,

    -- references
    NULLIF(p.transaction_id,'')  AS order_id,
    NULLIF(p.capture_id,'')      AS capture_id,
    NULLIF(p.mpesa_reference,'') AS mpesa_reference,

    -- payer identity (email direct, phone from gateway meta)
    NULLIF(p.payer_email,'') AS payer_email,
    COALESCE(
      NULLIF(p.meta->>'msisdn',''),
      NULLIF(p.meta->>'phone',''),
      NULLIF(p.meta->>'phoneNumber','')
    ) AS phone,

    -- product info
    p.package_id,
    pk.credits,
    pk.offer,

    -- metadata + timestamps
    p.meta,
    p.created_at,
    p.updated_at
  FROM payments p
  JOIN users u          ON u.id = p.user_id
  LEFT JOIN packages pk ON pk.id = p.package_id
  ${whereSql}
  ORDER BY p.created_at DESC
  LIMIT $${i}
  `,
  [...params, limit]
);


    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('[admin][listTransactions] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}


/* --------------------------- RECEIPTS/PROOF ------------------------ */
/**
 * GET /api/admin/proof
 * Query: one of
 *   - captureId=...        (PayPal)
 *   - orderId=...          (PayPal order/transaction id)
 *   - mpesaRef=...         (M-Pesa receipt e.g., MKR7... )
 *   - txRef=...            (M-Pesa CheckoutRequestID)
 * Optional:
 *   - email=...            (matches user_email or payer_email)
 *   - format=pdf|json      (default json unless Accept: application/pdf)
 */
export async function proofOfFulfillment(req, res) {
  try {
    const id        = (req.query.id        || '').toString().trim() || null;
    const captureId = (req.query.captureId || '').toString().trim() || null;
    const orderId   = (req.query.orderId   || '').toString().trim() || null;
    const mpesaRef  = (req.query.mpesaRef  || '').toString().trim() || null;
    const txRef     = (req.query.txRef     || '').toString().trim() || null;
    const emailRaw  = (req.query.email     || '').toString().trim();
    const email     = emailRaw ? emailRaw.toLowerCase() : null;

    if (!id && !captureId && !orderId && !mpesaRef && !txRef) {
      return res.status(400).json({ success: false, message: 'Provide id OR captureId OR orderId OR mpesaRef OR txRef' });
    }

    const { rows } = await pool.query(
      `
      SELECT
        p.id AS payment_id,
        p.user_id,
        u.email AS user_email,
        u.name  AS user_name,

        -- money & status
        p.amount, p.currency, p.status,

        -- methods and providers
        p.payment_method,
        COALESCE(NULLIF(p.method,''), p.payment_method) AS method,
        NULLIF(p.provider,'') AS provider,
        NULLIF(p.provider_order_id,'') AS provider_order_id,
        NULLIF(p.intent,'') AS intent,

        -- references
        NULLIF(p.transaction_id,'')  AS order_id,
        NULLIF(p.capture_id,'')      AS capture_id,
        NULLIF(p.mpesa_reference,'') AS mpesa_reference,

        -- payer identity
        NULLIF(p.payer_email,'') AS payer_email,
        COALESCE(
          NULLIF(p.meta->>'msisdn',''),
          NULLIF(p.meta->>'phone',''),
          NULLIF(p.meta->>'phoneNumber','')
        ) AS phone,

        -- product info
        p.package_id,
        pk.credits AS package_credits,
        pk.price   AS package_price,
        pk.currency AS package_price_currency,
        pk.offer   AS package_offer,

        -- metadata + timestamps
        p.meta,
        p.created_at,
        p.updated_at
      FROM payments p
      JOIN users u          ON u.id  = p.user_id
      LEFT JOIN packages pk ON pk.id = p.package_id
      WHERE
        ($1::bigint IS NOT NULL AND p.id = $1::bigint) OR
        ($2::text   IS NOT NULL AND p.capture_id = $2) OR
        ($3::text   IS NOT NULL AND p.transaction_id = $3) OR
        ($4::text   IS NOT NULL AND p.mpesa_reference = $4) OR
        ($5::text   IS NOT NULL AND p.transaction_id = $5)
      AND   ($6::text IS NULL OR LOWER(u.email) = $6 OR LOWER(COALESCE(p.payer_email,'')) = $6)
      ORDER BY p.created_at DESC
      LIMIT 1
      `,
      [id, captureId, orderId, mpesaRef, txRef, email]
    );

    const row = rows[0];
    if (!row) {
      return res.status(404).json({ success: false, message: 'No record found for the provided reference(s)' });
    }

    const isMpesa = String(row.payment_method || row.method || '').toLowerCase().includes('mpesa');
    const methodLabel = isMpesa ? 'M-Pesa' : 'PayPal';

    // JSON response path
    const wantsPdf =
      String(req.query.format || '').toLowerCase() === 'pdf' ||
      req.accepts(['application/pdf', 'json']) === 'application/pdf';
    if (!wantsPdf) {
      return res.json({ success: true, proof: row });
    }

    // ─────────────────────────────────────────────────────────────
    //                      BRANDING (customize)
    // ─────────────────────────────────────────────────────────────
    const BRAND = {
      name:     process.env.RECEIPT_BRAND_NAME || 'DayBreak Learner',
      company:  'EKAZICONNECT SOLUTIONS LTD',
      website:  'daybreaklearner.com',
      address:  'Mama Ngina Street, Nairobi, Kenya',
      emails:   ['support@daybreaklearning.com', 'ekazilimited@gmail.com'],
      phones:   ['+254 728 872 800', '+254 720 423 764'],
      colors:   { primary: '#A259FF', plum: '#2A1E5C', ink: '#0F172A' },
      logoPublicId:       process.env.CERT_LOGO_PUBLIC_ID || 'branding/logo',
      signaturePublicId:  process.env.RECEIPT_SIGNATURE_PUBLIC_ID || 'branding/signature',
    };

    // Build a verification URL that returns JSON proof (handy on scan)
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const refParam =
      (row.capture_id && `captureId=${encodeURIComponent(row.capture_id)}`) ||
      (row.mpesa_reference && `mpesaRef=${encodeURIComponent(row.mpesa_reference)}`) ||
      (row.order_id && `orderId=${encodeURIComponent(row.order_id)}`) ||
      `id=${encodeURIComponent(row.payment_id)}`;
    const verifyUrl = `${baseUrl}/api/admin/proof?${refParam}&format=json`;

    // Preload assets (soft-fail)
    const [logoPng, signPng, qrPng] = await Promise.all([
      fetchCloudinaryAsPngBuffer(BRAND.logoPublicId, { w: 140 }),
       fetchCloudinaryAsPngBuffer(BRAND.signaturePublicId, { w: 200, trim: true }),
      (async () => {
        try {
          return await QRCode.toBuffer(verifyUrl, {
            type: 'png',
            width: 110,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
        } catch { return null; }
      })(),
    ]);

    // ─────────────────────────────────────────────────────────────
    //                        PDF LAYOUT
    // ─────────────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'application/pdf');
    const fnameRef = row.capture_id || row.mpesa_reference || row.order_id || row.payment_id;
    res.setHeader('Content-Disposition', `attachment; filename="DayBreak_Receipt_${fnameRef}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    doc.info = {
      Title: `Receipt ${fnameRef}`,
      Author: BRAND.name,
      Subject: `Payment Receipt ${fnameRef}`,
      Creator: 'TutorApp',
      CreationDate: new Date(),
    };
    doc.pipe(res);

    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const usableW = pageW - margin * 2;

    // Background / frame / watermark
    drawBackdrop(doc);
    drawWatermark(doc, BRAND.name);

    // Header band contents
    // Left: logo + brand; Right: big RECEIPT tag + date
    const headY = 26;
    if (logoPng) doc.image(logoPng, margin, headY, { width: 60 });
    doc.fillColor(BRAND.colors.ink).font('Helvetica-Bold').fontSize(16)
       .text(BRAND.company, margin + 72, headY + 2, { width: usableW - 200 });
    doc.font('Helvetica').fontSize(10)
       .fillColor('#374151')
       .text(`${BRAND.name} • ${BRAND.website}`, margin + 72, headY + 24);

    doc.fillColor(BRAND.colors.ink).font('Helvetica-Bold').fontSize(22)
       .text('RECEIPT', margin + usableW - 140, headY + 2, { width: 140, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#4B5563')
       .text(new Date(row.created_at).toLocaleString(), margin + usableW - 160, headY + 30, { width: 160, align: 'right' });

    // Seller / Buyer columns
    doc.moveTo(margin, 118);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.colors.ink).text('Seller', margin, 118);
    doc.font('Helvetica').fontSize(10).fillColor('#111')
       .text(BRAND.company).text(BRAND.address)
       .text(
        Array.isArray(BRAND.emails) && BRAND.emails.length
          ? `Email: ${BRAND.emails.join('\n       ')}`
          : 'Email: —'
      )

       .text(`Tel: ${BRAND.phones.join(' / ')}`);

    const rightX = margin + usableW / 2 + 18;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.colors.ink).text('Buyer', rightX, 118);
    doc.font('Helvetica').fontSize(10).fillColor('#111')
       .text(`Name: ${row.user_name || '—'}`, rightX)
       .text(`Account Email: ${row.user_email}`, rightX)
       .text(`${isMpesa ? 'M-Pesa Phone' : 'Payer Email'}: ${isMpesa ? (row.phone || '—') : (row.payer_email || '—')}`, rightX);

    // Summary cards (Amount • Method • Status • Reference)
    const cardsY = 210;
    const cardW = (usableW - 18) / 2;
    const cardH = 64;
    function drawCard(x, y, title, value) {
      doc.save();
      doc.roundedRect(x, y, cardW, cardH, 8).fill('#F8FAFC').strokeColor('#E5E7EB').stroke();
      doc.fillColor('#6B7280').font('Helvetica').fontSize(9).text(title, x + 12, y + 10);
      doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(14).text(value, x + 12, y + 28, { width: cardW - 24 });
      doc.restore();
    }
    drawCard(margin, cardsY, 'Amount', money(row.currency, row.amount));
    drawCard(margin + cardW + 18, cardsY, 'Method', methodLabel);

    drawCard(margin, cardsY + cardH + 12, 'Status', row.status);
    const refLine = row.capture_id ? `Capture: ${row.capture_id}`
                 : row.mpesa_reference ? `M-Pesa: ${row.mpesa_reference}`
                 : row.order_id ? `Order: ${row.order_id}`
                 : `Payment ID: ${row.payment_id}`;
    drawCard(margin + cardW + 18, cardsY + cardH + 12, 'Reference', refLine);

    // Line items (single digital item)
    const tableY = cardsY + cardH * 2 + 38;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BRAND.colors.ink).text('Items', margin, tableY);
    doc.moveTo(margin, tableY + 18).lineTo(margin + usableW, tableY + 18).strokeColor('#E5E7EB').stroke();

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#374151');
    doc.text('Description', margin, tableY + 24, { width: usableW * 0.55 });
    doc.text('Qty', margin + usableW * 0.6, tableY + 24, { width: 40, align: 'center' });
    doc.text('Price', margin + usableW * 0.72, tableY + 24, { width: 80, align: 'right' });
    doc.text('Total', margin + usableW * 0.86, tableY + 24, { width: 80, align: 'right' });

    doc.font('Helvetica').fontSize(10).fillColor('#111');
    const itemY = tableY + 44;
    const label = row.package_offer || 'Tokens Package';
    const credits = row.package_credits != null ? ` (${row.package_credits} credits)` : '';
    doc.text(`${label}${credits}`, margin, itemY, { width: usableW * 0.55 });
    doc.text('1', margin + usableW * 0.6, itemY, { width: 40, align: 'center' });
    const each = row.package_price != null ? money(row.package_price_currency, row.package_price) : money(row.currency, row.amount);
    doc.text(each, margin + usableW * 0.72, itemY, { width: 80, align: 'right' });
    doc.text(money(row.currency, row.amount), margin + usableW * 0.86, itemY, { width: 80, align: 'right' });

    doc.moveTo(margin, itemY + 18).lineTo(margin + usableW, itemY + 18).strokeColor('#E5E7EB').stroke();

    // QR + signature band
    const bandTop = itemY + 36;
    if (qrPng) {
      doc.image(qrPng, margin, bandTop, { width: 92 });
      doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('Scan to verify', margin, bandTop + 96, { width: 92, align: 'center' });
    }

   // Signature on the right (keep original size: width 200)
const sigX = margin + usableW - 240;
const lineY = bandTop + 82;

// Draw baseline
doc.moveTo(sigX, lineY).lineTo(sigX + 210, lineY).strokeColor('#9CA3AF').lineWidth(1).stroke();

// Place image so its bottom sits just above the line
if (signPng) {
  try {
    const img = doc.openImage(signPng);
    const w = 200;                                // same as before
    const h = Math.round((img.height / img.width) * w);
    const gap = 4;                                 // small space above the line
    const lineW = 210;
    const x = sigX + Math.max(0, (lineW - w) / 2); // center on the line
    const y = lineY - h - gap;                     // bottom-align to the line
    doc.image(signPng, x, y, { width: w });
  } catch {
    // fallback (old behavior)
    doc.image(signPng, sigX, bandTop - 6, { width: 200 });
  }
}

// Label
doc.font('Helvetica').fontSize(10).fillColor('#374151')
   .text('Authorized Signature', sigX, lineY + 6, { width: 210, align: 'center' });


    // Meta (optional)
    const metaObj = row.meta && typeof row.meta === 'object' ? row.meta : null;
    if (metaObj && Object.keys(metaObj).length) {
      const metaY = lineY + 42;
      doc.font('Helvetica-Bold').fontSize(11).fillColor(BRAND.colors.ink).text('Gateway Meta', margin, metaY);
      doc.font('Helvetica').fontSize(9).fillColor('#111');
      const pretty = JSON.stringify(metaObj, null, 2);
      doc.text(pretty, margin, metaY + 16, { width: usableW });
    }

    // Tear-off stub (bottom)
    const footerBandY = doc.page.height - doc.page.margins.bottom - 80;
    doc.save();
    doc.rect(0, footerBandY - 8, pageW, 100).fill('#F9FAFB');
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827')
      .text('Receipt Stub', margin, footerBandY);
    doc.font('Helvetica').fontSize(9).fillColor('#111')
      .text(`Ref: ${refLine}`, margin, footerBandY + 18, { width: usableW * 0.66 })
      .text(`Amount: ${money(row.currency, row.amount)}`, margin + usableW * 0.7, footerBandY + 18, { width: usableW * 0.3, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280')
      .text(`${BRAND.name} • https://${BRAND.website}`, margin, footerBandY + 44, { width: usableW, align: 'center' });

    doc.end();
  } catch (err) {
    console.error('[admin][proofOfFulfillment]', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}




// Unified admin financial feed (payments + tutor withdrawals)
// ?kind=all|payments|withdrawals  (default: all)
export async function listFinancialFeed(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const kind = String(req.query.kind || 'all').toLowerCase();

    const parts = [];

    if (kind === 'all' || kind === 'payments') {
      parts.push(`
        SELECT
          p.id::text                       AS id,
          'payment'                        AS source,
          p.user_id,
          u.email                          AS user_email,
          u.name                           AS user_name,
          p.amount,
          p.currency,
          p.status,
          COALESCE(NULLIF(LOWER(p.payment_method), ''), 'paypal') AS payment_method,
          p.transaction_id                 AS order_id,
          p.capture_id,
          p.mpesa_reference,
          p.payer_email,
          COALESCE(
            NULLIF(p.meta->>'msisdn',''),
            NULLIF(p.meta->>'phone',''),
            NULLIF(p.meta->>'phoneNumber','')
          )                                AS phone,
          p.package_id,
          pk.credits,
          pk.offer,
          p.created_at
        FROM payments p
        JOIN users u ON u.id = p.user_id
        LEFT JOIN packages pk ON pk.id = p.package_id
      `);
    }

    if (kind === 'all' || kind === 'withdrawals') {
      parts.push(`
        SELECT
          t.id::text                       AS id,
          'withdrawal'                     AS source,
          t.user_id,
          u.email                          AS user_email,
          u.name                           AS user_name,
          t.amount,
          t.currency,
          t.status,
          LOWER(t.payment_method)          AS payment_method,
          NULL                             AS order_id,
          NULL                             AS capture_id,
          t.reference                      AS mpesa_reference, -- reuse column for display
          NULL                             AS payer_email,
          NULL                             AS phone,
          NULL                             AS package_id,
          NULL                             AS credits,
          NULL                             AS offer,
          t.date                           AS created_at
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        WHERE t.type = 'Withdrawal Request'
      `);
    }

    // If somehow no kind matched, return empty list safely
    if (!parts.length) {
      return res.json({ success: true, transactions: [] });
    }

    const unionSql = parts.join(' UNION ALL ');
    const finalSql = `
      ${unionSql}
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const { rows } = await pool.query(finalSql, [limit]);
    return res.json({ success: true, transactions: rows });
  } catch (err) {
    console.error('[admin][listFinancialFeed] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}



export async function listUsers(req, res) {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const q = String(req.query.q || '').trim().toLowerCase();

    const params = [];
    let i = 1;
    let where = '';

    if (q) {
      where = `WHERE LOWER(u.email) LIKE $${i} OR LOWER(COALESCE(u.name,'')) LIKE $${i}`;
      params.push(`%${q}%`);
      i++;
    }

    const { rows } = await pool.query(
      `
      SELECT
        u.id,
        u.email,
        u.name,
        u.role,
        COALESCE(u.tokens, 0) AS tokens,
        (p.id IS NOT NULL) AS "hasProfile",
        p.id AS "profileId"
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      ${where}
      ORDER BY u.id DESC
      LIMIT $${i}
      `,
      [...params, limit]
    );

    return res.json({ success: true, users: rows });
  } catch (err) {
    console.error('[admin][listUsers] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function adminSetRole(req, res) {
  try {
    const { userId, role } = req.body || {};
    const allowed = new Set(['student', 'tutor', 'admin', 'superadmin', null]);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    if (!allowed.has(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const { rows } = await pool.query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role, COALESCE(tokens,0) AS tokens',
      [role, userId]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    // Does the user have a profile?
    const prof = await pool.query('SELECT id FROM profiles WHERE user_id = $1 LIMIT 1', [userId]);
    const user = {
      ...rows[0],
      hasProfile: Boolean(prof.rows[0]),
      profileId: prof.rows[0]?.id ?? null,
    };

    return res.json({ success: true, user });
  } catch (err) {
    console.error('[admin][adminSetRole] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function adminAdjustTokens(req, res) {
  try {
    const { userId, op, amount } = req.body || {};
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }

    let sql;
    if (op === 'add') {
      sql = 'UPDATE users SET tokens = COALESCE(tokens,0) + $1 WHERE id = $2 RETURNING tokens';
    } else if (op === 'sub') {
      sql = 'UPDATE users SET tokens = GREATEST(COALESCE(tokens,0) - $1, 0) WHERE id = $2 RETURNING tokens';
    } else if (op === 'set') {
      sql = 'UPDATE users SET tokens = $1 WHERE id = $2 RETURNING tokens';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid op' });
    }

    const { rows } = await pool.query(sql, [n, userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, tokens: Number(rows[0].tokens) });
  } catch (err) {
    console.error('[admin][adminAdjustTokens] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function adminDeleteUser(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, message: 'Invalid userId' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM profiles WHERE user_id = $1', [userId]);
    const del = await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');
    if (del.rowCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.sendStatus(204);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[admin][adminDeleteUser] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  } finally {
    client.release();
  }
}

export async function adminResetPassword(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const email = rows[0].email;
    // Create OTP valid for 10 minutes (reusing your userController logic)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await pool.query(
      "UPDATE users SET reset_otp = $1, otp_expiry = NOW() + INTERVAL '10 minutes' WHERE id = $2",
      [otp, userId]
    );
    await sendOTP(email, otp);
    return res.json({ success: true });
  } catch (err) {
    console.error('[admin][adminResetPassword] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function adminImpersonateUser(req, res) {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid userId' });
    }
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User not found' });

    const token = createToken(userId);
    return res.json({ success: true, token });
  } catch (err) {
    console.error('[admin][adminImpersonateUser] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

export async function upsertPackage(req, res) {
  try {
    const creditsParam = req.params?.credits;
    const {
      credits: bodyCredits,
      priceUSD, priceKES,
      offer = null,
    } = req.body || {};

    // Determine credits value
    const credits = Number(creditsParam ?? bodyCredits);
    if (!Number.isFinite(credits) || credits <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid credits' });
    }

    const usdPrice = Number(priceUSD);
    const kesPrice = Number(priceKES);
    if (!Number.isFinite(usdPrice) || usdPrice < 0) {
      return res.status(400).json({ success: false, message: 'Invalid USD price' });
    }
    if (!Number.isFinite(kesPrice) || kesPrice < 0) {
      return res.status(400).json({ success: false, message: 'Invalid KES price' });
    }

    // Manual UPSERT without requiring a unique constraint
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const updUSD = await client.query(
        `UPDATE packages SET price = $1, offer = $2
           WHERE credits = $3 AND currency = 'USD'
       RETURNING id, credits, price, currency, offer`,
        [usdPrice, offer, credits]
      );
      let usdRow = updUSD.rows[0];
      if (!usdRow) {
        const ins = await client.query(
          `INSERT INTO packages (credits, price, currency, offer)
           VALUES ($1,$2,'USD',$3)
        RETURNING id, credits, price, currency, offer`,
          [credits, usdPrice, offer]
        );
        usdRow = ins.rows[0];
      }

      const updKES = await client.query(
        `UPDATE packages SET price = $1, offer = $2
           WHERE credits = $3 AND currency = 'KES'
       RETURNING id, credits, price, currency, offer`,
        [kesPrice, offer, credits]
      );
      let kesRow = updKES.rows[0];
      if (!kesRow) {
        const ins = await client.query(
          `INSERT INTO packages (credits, price, currency, offer)
           VALUES ($1,$2,'KES',$3)
        RETURNING id, credits, price, currency, offer`,
          [credits, kesPrice, offer]
        );
        kesRow = ins.rows[0];
      }

      await client.query('COMMIT');
      return res.json({
        success: true,
        packages: [usdRow, kesRow],
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[admin][upsertPackage] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}

/**
 * DELETE /api/admin/packages/:credits
 * Deletes BOTH USD & KES rows for a credits tier.
 */
export async function deletePackage(req, res) {
  try {
    const credits = Number(req.params.credits);
    if (!Number.isFinite(credits) || credits <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid credits' });
    }
    const { rowCount } = await pool.query(
      `DELETE FROM packages WHERE credits = $1`,
      [credits]
    );
    return res.json({ success: true, deleted: rowCount });
  } catch (err) {
    console.error('[admin][deletePackage] error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
}