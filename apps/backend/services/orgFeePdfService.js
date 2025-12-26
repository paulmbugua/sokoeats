// apps/backend/services/orgFeePdfService.js
import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

/* ─────────────────────────────────────────────────────────
 * Cloudinary image loader (copied style from examPdf service)
 * ───────────────────────────────────────────────────────── */

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '';

async function fetchBufferWithSignedRetry(
  url,
  { responseType = 'arraybuffer', timeout = 6000 } = {},
) {
  const tryFetch = async (theUrl) =>
    axios.get(theUrl, {
      responseType,
      timeout,
      validateStatus: () => true,
    });

  const first = await tryFetch(url);
  if (first.status === 200) return Buffer.from(first.data);

  // Cloudinary private asset signed retry (401)
  if (first.status === 401) {
    const cfg = cloudinary.config() || {};
    if (cfg?.api_secret) {
      const u = new URL(url);
      const deliveryPath = u.pathname;
      const token = cloudinary.utils.generate_auth_token({
        start_time: Math.floor(Date.now() / 1000) - 30,
        duration: 300,
        acl: [deliveryPath],
      });
      const sep = u.search ? '&' : '?';
      const signedUrl = `${url}${sep}__cld_token__=${token}`;
      const second = await tryFetch(signedUrl);
      if (second.status === 200) return Buffer.from(second.data);
    }
  }

  const xerr = first.headers?.['x-cld-error'];
  console.warn('[orgFeePdf] fetchBufferWithSignedRetry failed', {
    status: first.status,
    x_cld_error: xerr,
    url,
  });
  return null;
}

async function fetchCloudinaryAsPngBuffer(
  idOrUrl,
  { w, h, q = 'auto', trim = false, exact = false, dpr = 2 } = {},
) {
  if (!idOrUrl) return null;

  // If full URL, fetch directly (with signed retry)
  if (typeof idOrUrl === 'string' && idOrUrl.includes('://')) {
    try {
      const buf = await fetchBufferWithSignedRetry(idOrUrl, {
        responseType: 'arraybuffer',
        timeout: 6000,
      });
      if (buf) return buf;
    } catch (e) {
      console.warn('[orgFeePdf] direct image fetch failed', e?.message);
    }
    return null;
  }

  if (!CLOUDINARY_CLOUD_NAME) return null;

  const parts = [];
  if (trim) parts.push('e_trim');
  if (typeof dpr === 'number' && dpr > 0) parts.push(`dpr_${dpr}`);
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  parts.push(exact ? 'c_scale' : 'c_limit');
  parts.push(`q_${q}`, 'f_png');

  const transform = parts.join(',');
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transform}/${idOrUrl}.png`;

  try {
    const buf = await fetchBufferWithSignedRetry(url, {
      responseType: 'arraybuffer',
      timeout: 6000,
    });
    return buf;
  } catch (e) {
    console.warn('[orgFeePdf] Cloudinary fetch failed:', {
      url,
      status: e?.response?.status,
      msg: e?.message,
    });
    return null;
  }
}

async function tryLoadImageBuffer(
  idOrUrl,
  { w, h, trim = false, exact = false, dpr = 2 } = {},
) {
  if (!idOrUrl) return null;

  const looksLikePublicId =
    typeof idOrUrl === 'string' && !idOrUrl.includes('://');
  const looksLikeCloudinaryUrl =
    typeof idOrUrl === 'string' && idOrUrl.includes('res.cloudinary.com');

  if (looksLikePublicId || looksLikeCloudinaryUrl) {
    const buf = await fetchCloudinaryAsPngBuffer(idOrUrl, {
      w,
      h,
      trim,
      exact,
      dpr,
    });
    if (buf) return buf;
  }

  // Fallback: arbitrary URL fetch (Node 18+)
  try {
    if (typeof fetch !== 'function') return null;
    const res = await fetch(idOrUrl);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
 * Currency helpers (RESPONSIVE: KES/QAR/etc)
 * ───────────────────────────────────────────────────────── */

const normCur = (c) =>
  String(c || '')
    .trim()
    .toUpperCase();

  function normalizeCurrency(input, fallback = null) {
  const cur = normCur(input);

  // allow only 2–12 letters (same rule you use elsewhere)
  if (cur && /^[A-Z]{2,12}$/.test(cur)) return cur;

  const fb = normCur(fallback);
  if (fb && /^[A-Z]{2,12}$/.test(fb)) return fb;

  return null;
}

function guessCurrency({ org, structure, rows, totalsCurrency } = {}) {
  const c1 = normCur(totalsCurrency);
  if (c1) return c1;

  const c2 = normCur(structure?.currency);
  if (c2) return c2;

  const c3 = normCur(org?.currency || org?.default_currency);
  if (c3) return c3;

  const r = Array.isArray(rows) ? rows : [];
  for (const row of r) {
    const cc = normCur(row?.charge_currency);
    if (cc) return cc;
    const pc = normCur(row?.payment_currency);
    if (pc) return pc;
  }

  // true fallback only if absolutely nothing is present
  return 'USD';
}



function moneyFromCents(cents, currency) {
  const cur = normCur(currency);
  const v = Number(cents || 0) / 100;

  try {
    // currencyDisplay:"code" prints "KES 1,234.00"
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: cur,
      currencyDisplay: 'code',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

function fmtDate(dtLike) {
  if (!dtLike) return '';
  const d = new Date(dtLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

const oneline = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/* ─────────────────────────────────────────────────────────
 * Amount pickers (fix 0.00 payments + flexible aliases)
 * ───────────────────────────────────────────────────────── */

function pickChargeAmountCents(r) {
  const v =
    r?.charge_amount ??
    r?.charge_amount_cents ??
    r?.charge_cents ??
    // only as a last fallback (some rows might carry amount_cents for charges)
    (r?.charge_id && !r?.payment_id ? r?.amount_cents : null) ??
    null;

  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickPaymentAmountCents(r) {
  const v =
    r?.payment_amount ??
    r?.payment_amount_cents ??
    r?.payment_cents ??
    // extraPayments rows from controller often have amount_cents (no payment_amount alias)
    (r?.payment_id ? r?.amount_cents : null) ??
    null;

  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/* ─────────────────────────────────────────────────────────
 * Multi-currency totals (NO MIXING)
 * - Dedup charges by charge_id (LEFT JOIN repeats charges per payment)
 * - Dedup payments by payment_id
 * ───────────────────────────────────────────────────────── */

function computeStatementTotalsByCurrency(rows) {
  const m = new Map(); // cur -> { currency, totalCharges, totalPayments, balance }

  const ensureCur = (curRaw) => {
    const cur = normCur(curRaw) || 'USD';
    if (!m.has(cur)) {
      m.set(cur, { currency: cur, totalCharges: 0, totalPayments: 0, balance: 0 });
    }
    return m.get(cur);
  };

  const seenCharges = new Set();
  const seenPayments = new Set();

  for (const r of rows || []) {
    // Charges (dedupe by charge_id)
    if (r?.charge_id) {
      const cid = String(r.charge_id);
      if (!seenCharges.has(cid)) {
        seenCharges.add(cid);
        const cur = normCur(r?.charge_currency || r?.currency) || 'USD';
        ensureCur(cur).totalCharges += Number(pickChargeAmountCents(r) || 0);
      }
    }

    // Payments (dedupe by payment_id)
    if (r?.payment_id) {
      const pid = String(r.payment_id);
      if (!seenPayments.has(pid)) {
        seenPayments.add(pid);
        const cur = normCur(r?.payment_currency || r?.currency) || 'USD';
        ensureCur(cur).totalPayments += Number(pickPaymentAmountCents(r) || 0);
      }
    }
  }

  const out = Array.from(m.values()).map((x) => ({
    ...x,
    balance: Number(x.totalCharges || 0) - Number(x.totalPayments || 0),
  }));

  out.sort((a, b) => String(a.currency).localeCompare(String(b.currency)));
  return out;
}

function deriveLearnerMeta({ learner, learnerName, admissionCode, learnerId, rows }) {
  const r0 = Array.isArray(rows) && rows.length ? rows[0] : null;

  const name =
    oneline(learnerName) ||
    oneline(learner?.name) ||
    oneline(r0?.learner_name) ||
    oneline(r0?.student_name) ||
    (learnerId ? `Learner ${oneline(learnerId)}` : 'Learner');

  const adm =
    oneline(admissionCode) ||
    oneline(learner?.admission_code) ||
    oneline(r0?.admission_code) ||
    oneline(r0?.admissionCode) ||
    '';

  return { name, admissionCode: adm };
}

/* ─────────────────────────────────────────────────────────
 * PDF primitives (styled like examPdf)
 * ───────────────────────────────────────────────────────── */

function drawHeaderBand(doc, { org, title, subtitle, logoBuf }) {
  const pageWidth = Number(doc.page.width) || 595.28;
  const pageHeight = Number(doc.page.height) || 841.89;
  const leftMargin = Number(doc.page.margins?.left) || 40;
  const rightMargin = Number(doc.page.margins?.right) || 40;
  const innerWidth = pageWidth - leftMargin - rightMargin;

  const headerHeight = 76;

  doc.save().rect(0, 0, pageWidth, headerHeight).fill('#f3f4f6').restore();

  if (logoBuf) {
    try {
      doc.image(logoBuf, leftMargin, 14, { fit: [48, 48] });
    } catch {
      // ignore
    }
  }

  const name = (org?.name && oneline(org.name)) || 'Organization';

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(name, leftMargin + (logoBuf ? 60 : 0), 18, {
      width: innerWidth - (logoBuf ? 60 : 0),
      align: 'center',
    });

  const contactBits = [org?.address_line1, org?.address_line2]
    .map(oneline)
    .filter(Boolean);

  const contactInlineBits = [
    org?.phone_number && `Tel: ${oneline(org.phone_number)}`,
    org?.contact_email && `Email: ${oneline(org.contact_email)}`,
    org?.website_url && `Website: ${oneline(org.website_url)}`,
  ].filter(Boolean);

  const lines = [
    ...contactBits,
    contactInlineBits.length ? contactInlineBits.join('   •   ') : null,
  ].filter(Boolean);

  let lastContactBottomY = 32;
  if (lines.length) {
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    lines.forEach((line, idx) => {
      const lineY = 40 + idx * 10;
      doc.text(line, leftMargin + (logoBuf ? 60 : 0), lineY, {
        width: innerWidth - (logoBuf ? 60 : 0),
        align: 'center',
      });
      lastContactBottomY = lineY + 10;
    });
  }

  const minTitleY = headerHeight - 12;
  const titleY = Math.max(minTitleY, lastContactBottomY + 6);

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(oneline(title || ''), leftMargin, titleY, {
      width: innerWidth,
      align: 'center',
    });

  if (subtitle) {
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(oneline(subtitle), leftMargin, titleY + 14, {
        width: innerWidth,
        align: 'center',
      });
  }

  const ruleY = subtitle ? titleY + 28 : titleY + 16;
  doc
    .moveTo(leftMargin, ruleY)
    .lineTo(pageWidth - rightMargin, ruleY)
    .strokeColor('#d1d5db')
    .lineWidth(0.8)
    .stroke();

  doc.y = ruleY + 14;
  doc.fillColor('#111827');

  return { pageWidth, pageHeight, leftMargin, rightMargin, innerWidth };
}

function ensureSpace(doc, bottomMarginY, drawPageHeader, minHeight = 40) {
  if (doc.y + minHeight <= bottomMarginY) return;
  doc.addPage();
  drawPageHeader(true);
}

function drawSummaryTiles(doc, { leftMargin, innerWidth, tiles }) {
  if (!tiles?.length) return;

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
  doc.text('Summary', leftMargin, doc.y);
  doc.moveDown(0.2);

  const boxHeight = 32;
  const cols = Math.min(4, tiles.length);
  const colWidth = innerWidth / cols;

  let idx = 0;
  let y = doc.y;

  while (idx < tiles.length) {
    for (let c = 0; c < cols && idx < tiles.length; c++, idx++) {
      const [label, value] = tiles[idx];
      const x = leftMargin + c * colWidth;

      doc
        .save()
        .roundedRect(x, y, colWidth - 6, boxHeight, 6)
        .fill('#f9fafb')
        .strokeColor('#e5e7eb')
        .lineWidth(0.5)
        .stroke()
        .restore();

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#6b7280')
        .text(String(label), x + 6, y + 4, { width: colWidth - 16 });

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(String(value), x + 6, y + 14, { width: colWidth - 16 });
    }

    y += boxHeight + 4;
  }

  doc.y = y + 4;
  doc.fillColor('#111827');
}

function drawTotalsByCurrencyTable(doc, {
  pageWidth,
  pageHeight,
  leftMargin,
  rightMargin,
  innerWidth,
  bottomMarginY,
  totalsByCurrency,
  drawPageHeader,
  fallbackCurrency, // ✅ pass from renderFeeStatementPdf (NOT hardcoded to USD)
}) {
  const rowsRaw = Array.isArray(totalsByCurrency) ? totalsByCurrency : [];
  if (!rowsRaw.length) return;

  // Normalize + sanitize rows
  const rows = rowsRaw
    .map((t) => {
      const cur = normCur(t?.currency) || (fallbackCurrency ? normCur(fallbackCurrency) : null);

      const totalCharges = Number(
        t?.totalCharges ?? t?.total_charges ?? t?.charges ?? 0
      );
      const totalPayments = Number(
        t?.totalPayments ?? t?.total_payments ?? t?.payments ?? 0
      );
      const balance =
        t?.balance !== undefined && t?.balance !== null
          ? Number(t.balance)
          : totalCharges - totalPayments;

      return {
        currency: cur,               // may be null if truly unknown
        totalCharges,
        totalPayments,
        balance,
      };
    })
    // if currency still missing, keep it but label as '—' (don’t pretend it's USD)
    .sort((a, b) => {
      const ac = a.currency || '';
      const bc = b.currency || '';
      return ac.localeCompare(bc);
    });

  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827');
  doc.text('TOTALS BY CURRENCY', leftMargin, doc.y);
  doc.moveDown(0.35);

  const tableLeft = leftMargin;
  const tableRight = pageWidth - rightMargin;
  const tableWidth = tableRight - tableLeft;

  const colCur = tableLeft;
  const colCharges = colCur + 74;
  const colPays = colCharges + Math.floor(tableWidth * 0.33);
  const colBal = colPays + Math.floor(tableWidth * 0.33);

  const rowHeight = 14;

  const drawHeader = (continued = false) => {
    const y0 = doc.y;
    const y1 = y0 + rowHeight;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
    const lh = doc.currentLineHeight();
    const ty = y0 + (rowHeight - lh) / 2;

    doc.text('CUR', colCur + 6, ty, { width: colCharges - colCur - 10 });
    doc.text('CHARGES', colCharges, ty, { width: colPays - colCharges - 8, align: 'right' });
    doc.text('PAYMENTS', colPays, ty, { width: colBal - colPays - 8, align: 'right' });
    doc.text('BALANCE', colBal, ty, { width: tableRight - colBal - 6, align: 'right' });

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.7)
      .moveTo(tableLeft, y0)
      .lineTo(tableRight, y0)
      .stroke();
    doc.moveTo(tableLeft, y1).lineTo(tableRight, y1).stroke();

    doc.moveTo(tableLeft, y0).lineTo(tableLeft, y1).stroke();
    doc.moveTo(colCharges, y0).lineTo(colCharges, y1).stroke();
    doc.moveTo(colPays, y0).lineTo(colPays, y1).stroke();
    doc.moveTo(colBal, y0).lineTo(colBal, y1).stroke();
    doc.moveTo(tableRight, y0).lineTo(tableRight, y1).stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    doc.y = y1;
  };

  drawHeader(false);

  for (const t of rows) {
    ensureSpace(
      doc,
      bottomMarginY,
      () => {
        drawPageHeader(true);
        doc.moveDown(0.2);
        doc
          .font('Helvetica-Bold')
          .fontSize(9.5)
          .text('TOTALS BY CURRENCY (cont.)', leftMargin, doc.y);
        doc.moveDown(0.35);
        drawHeader(true);
      },
      rowHeight + 10,
    );

    const y0 = doc.y;
    const y1 = y0 + rowHeight;
    const lh = doc.currentLineHeight();
    const ty = y0 + (rowHeight - lh) / 2;

    const curLabel = t.currency || '—';

    // If currency is missing, do NOT format as USD. Render raw cents-ish numbers safely.
    const fmtMoney = (cents, cur) => {
      if (!cur) {
        // show as numeric cents with grouping (still better than pretending USD)
        const n = Number(cents || 0);
        return Number.isFinite(n) ? String(n) : '0';
      }
      return moneyFromCents(cents, cur);
    };

    doc.text(curLabel, colCur + 6, ty, { width: colCharges - colCur - 10 });
    doc.text(fmtMoney(t.totalCharges, t.currency), colCharges, ty, {
      width: colPays - colCharges - 8,
      align: 'right',
    });
    doc.text(fmtMoney(t.totalPayments, t.currency), colPays, ty, {
      width: colBal - colPays - 8,
      align: 'right',
    });
    doc.text(fmtMoney(t.balance, t.currency), colBal, ty, {
      width: tableRight - colBal - 6,
      align: 'right',
    });

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.5)
      .moveTo(tableLeft, y0)
      .lineTo(tableRight, y0)
      .stroke();
    doc.moveTo(tableLeft, y1).lineTo(tableRight, y1).stroke();

    doc.moveTo(tableLeft, y0).lineTo(tableLeft, y1).stroke();
    doc.moveTo(colCharges, y0).lineTo(colCharges, y1).stroke();
    doc.moveTo(colPays, y0).lineTo(colPays, y1).stroke();
    doc.moveTo(colBal, y0).lineTo(colBal, y1).stroke();
    doc.moveTo(tableRight, y0).lineTo(tableRight, y1).stroke();

    doc.y = y1;
  }

  doc.moveDown(0.6);
  doc.fillColor('#111827');
}


/* ─────────────────────────────────────────────────────────
 * Signatures block (Bursar/Finance + Principal)
 * ───────────────────────────────────────────────────────── */

function drawSignaturesBlock(
  doc,
  {
    leftMargin,
    rightMargin,
    innerWidth,
    pageHeight,
    bursarSigBuf,
    principalSigBuf,
  },
) {
  const bottomSafeY = pageHeight - 60;
  const signatureBlockHeight = 92;
  const sigTop = Math.max(doc.y, bottomSafeY - signatureBlockHeight);

  // separator line
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.7)
    .moveTo(leftMargin, sigTop - 6)
    .lineTo(doc.page.width - rightMargin, sigTop - 6)
    .stroke();

  // Two columns
  const colW = innerWidth * 0.42;
  const leftX = leftMargin;
  const rightX = doc.page.width - rightMargin - colW;

  const labelY = sigTop + 6;
  const sigMaxH = 45;
  const gap = 10;

  // LEFT: Bursar / Finance Office
  const leftLabel = 'Bursar / Finance Office';
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text(leftLabel, leftX, labelY, { width: colW, align: 'left' });

  const leftSigY = labelY + gap;
  let leftBottom = leftSigY + sigMaxH;

  if (bursarSigBuf) {
    try {
      const sigW = Math.min(colW - 20, 220);
      const sigX = leftX + (colW - sigW) / 2;
      doc.image(bursarSigBuf, sigX, leftSigY, { fit: [sigW, sigMaxH] });
      leftBottom = leftSigY + sigMaxH;
    } catch {
      // ignore
    }
  }

  // RIGHT: Head teacher / Principal
  const rightLabel = 'Head teacher / Principal';
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text(rightLabel, rightX, labelY, { width: colW, align: 'right' });

  const rightSigY = labelY + gap;
  let rightBottom = rightSigY + sigMaxH;

  if (principalSigBuf) {
    try {
      const sigW = Math.min(colW - 20, 220);

      // center signature under right-aligned label
      const labelWidth = doc.widthOfString(rightLabel);
      const labelRight = rightX + colW;
      const labelCenterX = labelRight - labelWidth / 2;

      const sigX = labelCenterX - sigW / 2;
      doc.image(principalSigBuf, sigX, rightSigY, { fit: [sigW, sigMaxH] });
      rightBottom = rightSigY + sigMaxH;
    } catch {
      // ignore
    }
  }

  // Signature lines
  const lineY = Math.max(leftBottom, rightBottom) + 4;

  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(leftX, lineY)
    .lineTo(leftX + colW, lineY)
    .stroke();

  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(rightX, lineY)
    .lineTo(rightX + colW, lineY)
    .stroke();

  doc.y = lineY + 8;
}

/* ─────────────────────────────────────────────────────────
 * Fee Structure PDF (styled table + logo)
 * ───────────────────────────────────────────────────────── */

export async function renderFeeStructurePdf({ org, structure }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const currency = guessCurrency({ org, structure });

  const principalSigSource =
    org?.registrar_signature_url ||
    org?.signature_url ||
    org?.principal_signature_url ||
    org?.headteacher_signature_url ||
    null;

  const bursarSigSource = org?.bursar_signature_url || org?.finance_signature_url || null;

  const [logoBuf, principalSigBuf, bursarSigBuf] = await Promise.all([
    tryLoadImageBuffer(org?.logo_url, { w: 240, h: 240, dpr: 2 }),
    tryLoadImageBuffer(principalSigSource, { w: 520, h: 200, trim: true, dpr: 2 }),
    tryLoadImageBuffer(bursarSigSource, { w: 520, h: 200, trim: true, dpr: 2 }),
  ]);

  const drawPageHeader = () =>
    drawHeaderBand(doc, {
      org,
      title: 'FEE STRUCTURE',
      subtitle: structure?.effective_term ? `Term: ${oneline(structure.effective_term)}` : '',
      logoBuf,
    });

  const { pageWidth, pageHeight, leftMargin, rightMargin, innerWidth } = drawPageHeader();
  const bottomMarginY = pageHeight - 60;

  const title = oneline(structure?.title || 'Structure');
  const desc = oneline(structure?.description || '');
  const metaLines = [
    ['Structure', title],
    desc ? ['Description', desc] : null,
    structure?.effective_term ? ['Term', oneline(structure.effective_term)] : null,
    ['Currency', currency],
    ['Generated', new Date().toISOString().slice(0, 19).replace('T', ' ')],
  ].filter(Boolean);

  doc.font('Helvetica-Bold').fontSize(10).text('Details', leftMargin, doc.y);
  doc.moveDown(0.25);

  const boxTopY = doc.y;
  const boxPad = 10;

  doc.save()
    .roundedRect(leftMargin, boxTopY, innerWidth, 62, 8)
    .fill('#ffffff')
    .strokeColor('#e5e7eb')
    .lineWidth(0.8)
    .stroke()
    .restore();

  let y = boxTopY + boxPad;
  metaLines.slice(0, 4).forEach(([k, v], idx) => {
    const rowY = y + idx * 12;
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`${k}:`, leftMargin + boxPad, rowY, { width: 90 });
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827').text(String(v), leftMargin + boxPad + 92, rowY, {
      width: innerWidth - (boxPad * 2 + 92),
    });
  });

  doc.y = boxTopY + 62 + 14;
  doc.fillColor('#111827');

  const items = Array.isArray(structure?.items) ? structure.items : [];
  if (!items.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text('No items configured.');
    drawSignaturesBlock(doc, {
      leftMargin,
      rightMargin,
      innerWidth,
      pageHeight,
      bursarSigBuf,
      principalSigBuf,
    });
    doc.end();
    return bufferPromise;
  }

  doc.font('Helvetica-Bold').fontSize(9.5).text('ITEMS', leftMargin, doc.y);
  doc.moveDown(0.35);

  const tableLeft = leftMargin;
  const tableRight = pageWidth - rightMargin;
  const tableWidth = tableRight - tableLeft;

  const colItem = tableLeft;
  const colAmount = colItem + Math.floor(tableWidth * 0.52);
  const colCadence = colAmount + Math.floor(tableWidth * 0.20);
  const colOpt = colCadence + Math.floor(tableWidth * 0.16);

  const rowHeight = 14;

  const drawItemsHeader = () => {
    const headerTopY = doc.y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
    const lh = doc.currentLineHeight();
    const textY = headerTopY + (rowHeight - lh) / 2;

    doc.text('ITEM', colItem + 6, textY, { width: colAmount - colItem - 10 });
    doc.text('AMOUNT', colAmount, textY, { width: colCadence - colAmount - 8, align: 'right' });
    doc.text('CADENCE', colCadence, textY, { width: colOpt - colCadence - 8, align: 'center' });
    doc.text('OPTIONAL', colOpt, textY, { width: tableRight - colOpt - 6, align: 'center' });

    const bottomY = headerTopY + rowHeight;

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.7)
      .moveTo(tableLeft, headerTopY)
      .lineTo(tableRight, headerTopY)
      .stroke();
    doc.moveTo(tableLeft, bottomY).lineTo(tableRight, bottomY).stroke();
    doc.moveTo(tableLeft, headerTopY).lineTo(tableLeft, bottomY).stroke();
    doc.moveTo(colAmount, headerTopY).lineTo(colAmount, bottomY).stroke();
    doc.moveTo(colCadence, headerTopY).lineTo(colCadence, bottomY).stroke();
    doc.moveTo(colOpt, headerTopY).lineTo(colOpt, bottomY).stroke();
    doc.moveTo(tableRight, headerTopY).lineTo(tableRight, bottomY).stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    doc.y = bottomY;
  };

  drawItemsHeader();

  for (const it of items) {
    ensureSpace(doc, bottomMarginY, () => {
      drawPageHeader();
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9.5).text('ITEMS (cont.)', leftMargin, doc.y);
      doc.moveDown(0.35);
      drawItemsHeader();
    }, rowHeight + 10);

    const rowTopY = doc.y;
    const rowBottomY = rowTopY + rowHeight;
    const lh = doc.currentLineHeight();
    const textY = rowTopY + (rowHeight - lh) / 2;

    const itemLabel = oneline(it?.label || '—');
    const cur = normCur(it?.currency) || currency;
    const amt = moneyFromCents(it?.amount_cents, cur);
    const cadence = oneline(it?.cadence || '—');
    const opt = it?.is_optional ? 'YES' : 'NO';

    doc.text(itemLabel, colItem + 6, textY, { width: colAmount - colItem - 10 });
    doc.text(amt, colAmount, textY, { width: colCadence - colAmount - 8, align: 'right' });
    doc.text(cadence, colCadence, textY, { width: colOpt - colCadence - 8, align: 'center' });
    doc.text(opt, colOpt, textY, { width: tableRight - colOpt - 6, align: 'center' });

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.5)
      .moveTo(tableLeft, rowTopY)
      .lineTo(tableRight, rowTopY)
      .stroke();
    doc.moveTo(tableLeft, rowBottomY).lineTo(tableRight, rowBottomY).stroke();
    doc.moveTo(tableLeft, rowTopY).lineTo(tableLeft, rowBottomY).stroke();
    doc.moveTo(colAmount, rowTopY).lineTo(colAmount, rowBottomY).stroke();
    doc.moveTo(colCadence, rowTopY).lineTo(colCadence, rowBottomY).stroke();
    doc.moveTo(colOpt, rowTopY).lineTo(colOpt, rowBottomY).stroke();
    doc.moveTo(tableRight, rowTopY).lineTo(tableRight, rowBottomY).stroke();

    doc.y = rowBottomY;

    const meta = it?.metadata && typeof it.metadata === 'object' ? it.metadata : null;
    if (meta && Object.keys(meta).length) {
      ensureSpace(doc, bottomMarginY, drawPageHeader, 18);
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#6b7280')
        .text(`Notes: ${oneline(JSON.stringify(meta))}`, colItem + 6, doc.y + 2, {
          width: innerWidth - 12,
        });
      doc.fillColor('#111827');
      doc.moveDown(0.5);
    }
  }

  drawSignaturesBlock(doc, {
    leftMargin,
    rightMargin,
    innerWidth,
    pageHeight,
    bursarSigBuf,
    principalSigBuf,
  });

  doc.end();
  return bufferPromise;
}

/* ─────────────────────────────────────────────────────────
 * Fee Statement PDF (NAME + Admission No + signatures)
 * - Totals are MULTI-CURRENCY (never mixed)
 * ───────────────────────────────────────────────────────── */

export async function renderFeeStatementPdf({
  org,
  learnerId,              // legacy fallback
  learner,                // { name, admission_code }
  learnerName,            // optional
  admissionCode,          // optional
  bursar_signature_url,
  entries,

  totals,                 // legacy (single currency only; keep for backward compat)
  totals_by_currency,     // ✅ NEW: [{ currency, totalCharges, totalPayments, balance }]
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const rows = Array.isArray(entries) ? entries : [];

  const { name: derivedName, admissionCode: derivedAdm } = deriveLearnerMeta({
    learner,
    learnerName,
    admissionCode,
    learnerId,
    rows,
  });

  // Normalize + validate totals_by_currency payload
  const coerceTotalsByCurrency = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        const currency = x?.currency ? normalizeCurrency(x.currency, 'USD') : null;
        if (!currency) return null;

        const totalCharges = Number(x?.totalCharges ?? x?.total_charges ?? 0);
        const totalPayments = Number(x?.totalPayments ?? x?.total_payments ?? 0);
        const balance =
          x?.balance !== undefined
            ? Number(x.balance)
            : totalCharges - totalPayments;

        return { currency, totalCharges, totalPayments, balance };
      })
      .filter(Boolean);
  };

  // ✅ Prefer controller-provided totals_by_currency (includes unlinked payments, etc.)
  const coerced = coerceTotalsByCurrency(totals_by_currency);
const totalsByCurrency = coerced.length ? coerced : computeStatementTotalsByCurrency(rows);


  const currencies = totalsByCurrency.map((x) => x.currency).filter(Boolean);
  const currenciesLabel = currencies.length ? currencies.join(', ') : (normCur(totals?.currency) || 'USD');
  const singleCurrency = currencies.length === 1 ? currencies[0] : null;

  // Fallback currency (used ONLY when a row has no currency)
  const fallbackCurrency = guessCurrency({
    org,
    structure: null,
    rows,
    totalsCurrency: singleCurrency || normCur(totals?.currency) || null,
  });

  // Principal/Registrar signature source
  const principalSigSource =
    org?.registrar_signature_url ||
    org?.signature_url ||
    org?.principal_signature_url ||
    org?.headteacher_signature_url ||
    null;

  // Bursar/Finance signature source
  const bursarSigSource =
    bursar_signature_url ||
    org?.bursar_signature_url ||
    org?.finance_signature_url ||
    null;

  const [logoBuf, principalSigBuf, bursarSigBuf] = await Promise.all([
    tryLoadImageBuffer(org?.logo_url, { w: 240, h: 240, dpr: 2 }),
    tryLoadImageBuffer(principalSigSource, { w: 520, h: 200, trim: true, dpr: 2 }),
    tryLoadImageBuffer(bursarSigSource, { w: 520, h: 200, trim: true, dpr: 2 }),
  ]);

  const drawPageHeader = (continued = false) => {
    const learnerLine = derivedAdm
      ? `Learner: ${derivedName}   •   Admission: ${derivedAdm}`
      : `Learner: ${derivedName}`;

    const meta = [
      learnerLine,
      `Currencies: ${currenciesLabel || (fallbackCurrency || 'USD')}`,
      `Generated: ${fmtDate(new Date())}`,
    ].join('   •   ');

    return drawHeaderBand(doc, {
      org,
      title: continued ? 'FEE STATEMENT (cont.)' : 'FEE STATEMENT',
      subtitle: meta,
      logoBuf,
    });
  };

  const { pageWidth, pageHeight, leftMargin, rightMargin, innerWidth } = drawPageHeader(false);
  const bottomMarginY = pageHeight - 60;

  if (!rows.length) {
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    doc.text('No charges or payments on record.');

    doc.moveDown(1.0);
    drawSignaturesBlock(doc, {
      leftMargin,
      rightMargin,
      innerWidth,
      pageHeight,
      bursarSigBuf,
      principalSigBuf,
    });

    doc.end();
    return bufferPromise;
  }

  // ─────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────
  if (singleCurrency) {
    const only =
      totalsByCurrency.find((x) => x.currency === singleCurrency) ||
      totalsByCurrency[0] ||
      { totalCharges: 0, totalPayments: 0, balance: 0 };

    drawSummaryTiles(doc, {
      leftMargin,
      innerWidth,
      tiles: [
        ['TOTAL CHARGES', moneyFromCents(only.totalCharges, singleCurrency)],
        ['TOTAL PAYMENTS', moneyFromCents(only.totalPayments, singleCurrency)],
        ['BALANCE', moneyFromCents(only.balance, singleCurrency)],
        ['TRANSACTIONS', String(rows.length)],
      ],
    });
  } else {
    drawSummaryTiles(doc, {
      leftMargin,
      innerWidth,
      tiles: [
        ['CURRENCIES', currenciesLabel || (fallbackCurrency || 'USD')],
        ['TRANSACTIONS', String(rows.length)],
      ],
    });

    drawTotalsByCurrencyTable(doc, {
      pageWidth,
      pageHeight,
      leftMargin,
      rightMargin,
      innerWidth,
      bottomMarginY,
      totalsByCurrency, // ✅ now driven by totals_by_currency
      drawPageHeader,
      fallbackCurrency,
    });

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#6b7280')
      .text(
        'Note: Totals are shown per currency. No exchange-rate conversion is applied.',
        leftMargin,
        doc.y,
        { width: innerWidth },
      );
    doc.fillColor('#111827');
    doc.moveDown(0.6);
  }

  // ─────────────────────────────────────────────
  // Transactions table
  // ─────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#111827');
  doc.text('TRANSACTIONS', leftMargin, doc.y);
  doc.moveDown(0.35);

  const tableLeft = leftMargin;
  const tableRight = pageWidth - rightMargin;
  const tableWidth = tableRight - tableLeft;

  // DATE | REF | DESCRIPTION | CHARGE | PAYMENT
  const colDate = tableLeft;
  const colRef = colDate + 66;
  const colDesc = colRef + 74;
  const colCharge = colDesc + Math.floor(tableWidth * 0.42);
  const colPay = colCharge + 86;

  const rowHeight = 14;

  const drawTxHeader = () => {
    const headerTopY = doc.y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
    const lh = doc.currentLineHeight();
    const textY = headerTopY + (rowHeight - lh) / 2;

    doc.text('DATE', colDate + 6, textY, { width: colRef - colDate - 10 });
    doc.text('REF', colRef + 4, textY, { width: colDesc - colRef - 8 });
    doc.text('DESCRIPTION', colDesc + 4, textY, { width: colCharge - colDesc - 8 });
    doc.text('CHARGE', colCharge, textY, { width: colPay - colCharge - 8, align: 'right' });
    doc.text('PAYMENT', colPay, textY, { width: tableRight - colPay - 6, align: 'right' });

    const bottomY = headerTopY + rowHeight;

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.7)
      .moveTo(tableLeft, headerTopY)
      .lineTo(tableRight, headerTopY)
      .stroke();
    doc.moveTo(tableLeft, bottomY).lineTo(tableRight, bottomY).stroke();

    doc.moveTo(tableLeft, headerTopY).lineTo(tableLeft, bottomY).stroke();
    doc.moveTo(colRef, headerTopY).lineTo(colRef, bottomY).stroke();
    doc.moveTo(colDesc, headerTopY).lineTo(colDesc, bottomY).stroke();
    doc.moveTo(colCharge, headerTopY).lineTo(colCharge, bottomY).stroke();
    doc.moveTo(colPay, headerTopY).lineTo(colPay, bottomY).stroke();
    doc.moveTo(tableRight, headerTopY).lineTo(tableRight, bottomY).stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    doc.y = bottomY;
  };

  drawTxHeader();

  for (const r of rows) {
    ensureSpace(
      doc,
      bottomMarginY,
      () => {
        drawPageHeader(true);
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9.5).text('TRANSACTIONS (cont.)', leftMargin, doc.y);
        doc.moveDown(0.35);
        drawTxHeader();
      },
      rowHeight + 10,
    );

    const rowTopY = doc.y;
    const rowBottomY = rowTopY + rowHeight;
    const lh = doc.currentLineHeight();
    const textY = rowTopY + (rowHeight - lh) / 2;

    const dateText =
      fmtDate(r?.created_at || r?.date || r?.charge_created_at || r?.payment_created_at) || '—';

    let ref = '';
    if (r?.charge_id) ref = `C#${r.charge_id}`;
    if (r?.payment_id) ref = ref ? `${ref}/P#${r.payment_id}` : `P#${r.payment_id}`;
    if (!ref && r?.reference) ref = oneline(r.reference);
    if (!ref) ref = '—';

    const descBits = [];
    if (r?.description) descBits.push(oneline(r.description));
    if (r?.method) descBits.push(`via ${oneline(r.method)}`);
    const desc = descBits.join(' • ') || '—';

    const chargeCur = normCur(r?.charge_currency) || fallbackCurrency;
    const payCur = normCur(r?.payment_currency) || fallbackCurrency;

    const chargeAmt =
      r?.charge_id ? moneyFromCents(pickChargeAmountCents(r), chargeCur) : '—';

    const payAmt =
      r?.payment_id ? moneyFromCents(pickPaymentAmountCents(r), payCur) : '—';

    doc.text(dateText, colDate + 6, textY, { width: colRef - colDate - 10 });
    doc.text(ref, colRef + 4, textY, { width: colDesc - colRef - 8 });
    doc.text(desc, colDesc + 4, textY, { width: colCharge - colDesc - 8 });

    doc.text(chargeAmt, colCharge, textY, {
      width: colPay - colCharge - 8,
      align: 'right',
    });

    doc.text(payAmt, colPay, textY, {
      width: tableRight - colPay - 6,
      align: 'right',
    });

    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.5)
      .moveTo(tableLeft, rowTopY)
      .lineTo(tableRight, rowTopY)
      .stroke();
    doc.moveTo(tableLeft, rowBottomY).lineTo(tableRight, rowBottomY).stroke();

    doc.moveTo(tableLeft, rowTopY).lineTo(tableLeft, rowBottomY).stroke();
    doc.moveTo(colRef, rowTopY).lineTo(colRef, rowBottomY).stroke();
    doc.moveTo(colDesc, rowTopY).lineTo(colDesc, rowBottomY).stroke();
    doc.moveTo(colCharge, rowTopY).lineTo(colCharge, rowBottomY).stroke();
    doc.moveTo(colPay, rowTopY).lineTo(colPay, rowBottomY).stroke();
    doc.moveTo(tableRight, rowTopY).lineTo(tableRight, rowBottomY).stroke();

    doc.y = rowBottomY;
  }

  doc.moveDown(0.8);

  ensureSpace(doc, bottomMarginY, drawPageHeader, 60);
  doc
    .font('Helvetica')
    .fontSize(7)
    .fillColor('#6b7280')
    .text(
      'This statement is system-generated. If you notice discrepancies, contact the finance office.',
      leftMargin,
      doc.y,
      { width: innerWidth },
    );
  doc.fillColor('#111827');

  // Signatures
  doc.moveDown(1.0);
  drawSignaturesBlock(doc, {
    leftMargin,
    rightMargin,
    innerWidth,
    pageHeight,
    bursarSigBuf,
    principalSigBuf,
  });

  doc.end();
  return bufferPromise;
}

/* ─────────────────────────────────────────────────────────
 * Institution-wide fee statement PDF
 * ───────────────────────────────────────────────────────── */

export async function renderInstitutionFeeStatementPdf({ org, rows, totalsByCurrency, dateLabel }) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const safeRows = Array.isArray(rows) ? rows : [];
  const totals = Array.isArray(totalsByCurrency) ? totalsByCurrency : [];

  const [logoBuf, principalSigBuf, bursarSigBuf] = await Promise.all([
    tryLoadImageBuffer(org?.logo_url, { w: 240, h: 240, dpr: 2 }),
    tryLoadImageBuffer(org?.principal_signature_url || org?.registrar_signature_url || org?.signature_url, {
      w: 520,
      h: 200,
      trim: true,
      dpr: 2,
    }),
    tryLoadImageBuffer(org?.finance_signature_url || org?.bursar_signature_url, {
      w: 520,
      h: 200,
      trim: true,
      dpr: 2,
    }),
  ]);

  const drawHeader = () => {
    const startY = doc.y;
    if (logoBuf) {
      doc.image(logoBuf, doc.x, startY, { width: 90, height: 90, fit: [90, 90] });
      doc.moveDown(0.2);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(org?.name || 'Institution', logoBuf ? doc.x + 100 : doc.x, startY, {
        continued: false,
      });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#4b5563')
      .text(dateLabel || `Generated: ${fmtDate(new Date())}`, logoBuf ? doc.x + 100 : doc.x, doc.y + 2);

    doc.moveDown();
    doc.fillColor('#111827');
  };

  drawHeader();
  doc.moveDown(1);

  const headers = ['Admission', 'Learner', 'Grade', 'Currency', 'Charged', 'Paid', 'Balance'];
  const colWidths = [70, 120, 70, 60, 70, 70, 70];
  const startX = doc.x;

  const drawRow = (values, isHeader = false) => {
    const y = doc.y;
    const lineHeight = isHeader ? 16 : 14;
    ensureSpace(doc, doc.page.height - 80, drawHeader, lineHeight + 6);
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(isHeader ? 10 : 9);

    values.forEach((val, idx) => {
      doc.text(String(val ?? ''), x, doc.y, { width: colWidths[idx], continued: false });
      x += colWidths[idx] + 6;
    });
    doc.moveDown(isHeader ? 0.4 : 0.2);
    doc.y = y + lineHeight;
  };

  drawRow(headers, true);
  doc.moveDown(0.2);

  safeRows.forEach((row) => {
    drawRow([
      row.admission_no || '—',
      row.learner_name || '—',
      row.grade || '—',
      row.currency || 'USD',
      money(row.total_charged || 0, row.currency || 'USD'),
      money(row.total_paid || 0, row.currency || 'USD'),
      money((row.total_charged || 0) - (row.total_paid || 0), row.currency || 'USD'),
    ]);
  });

  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(11).text('Totals');
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9);

  (totals.length ? totals : [{ currency: 'USD', total_charged: 0, total_paid: 0 }]).forEach((t) => {
    const cur = t.currency || 'USD';
    const charged = Number(t.total_charged || 0);
    const paid = Number(t.total_paid || 0);
    doc.text(
      `${cur}: Charged ${money(charged, cur)} • Paid ${money(paid, cur)} • Balance ${money(charged - paid, cur)}`,
      { width: doc.page.width - 80 },
    );
  });

  drawSignaturesBlock(doc, {
    leftMargin: doc.page.margins.left,
    rightMargin: doc.page.margins.right,
    innerWidth: doc.page.width - doc.page.margins.left - doc.page.margins.right,
    pageHeight: doc.page.height,
    bursarSigBuf,
    principalSigBuf,
  });

  doc.end();
  return bufferPromise;
}
