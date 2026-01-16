// apps/backend/services/transcriptService.js
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

/** Cloud name (supports both env names like your cert service) */
const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '';

/* ─────────────────────────────────────────────────────────
 * Fetching (with optional signed retry)
 * ───────────────────────────────────────────────────────── */
async function fetchBufferWithSignedRetry(
  url,
  { responseType = 'arraybuffer', timeout = 6000 } = {},
) {
  const tryFetch = async (theUrl) =>
    axios.get(theUrl, { responseType, timeout, validateStatus: () => true });

  const first = await tryFetch(url);
  if (first.status === 200) return Buffer.from(first.data);

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
  return null;
}

/** Simple Cloudinary fetch (PNG) */
async function fetchCloudinaryAsPngBuffer(
  cloudinaryPublicId,
  { w, h, q = 'auto' } = {},
) {
  if (!cloudinaryPublicId || !CLOUDINARY_CLOUD_NAME) return null;
  const parts = [];
  if (w) parts.push(`w_${w}`);
  if (h) parts.push(`h_${h}`);
  parts.push('c_limit', `q_${q}`, 'f_png');
  const transform = parts.join(',');
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${transform}/${cloudinaryPublicId}.png`;
  try {
    const buf = await fetchBufferWithSignedRetry(url, {
      responseType: 'arraybuffer',
      timeout: 6000,
    });
    return buf;
  } catch {
    return null;
  }
}

/** For signatures: trim + exact width like the certificate service */
async function fetchSignaturePngBuffer(
  idOrPublicId,
  { w = 600, q = 'auto:good', dpr = 2 } = {},
) {
  if (!idOrPublicId || !CLOUDINARY_CLOUD_NAME) return null;
  const parts = [
    `w_${w}`,
    'c_scale',
    'e_trim',
    `dpr_${dpr}`,
    `q_${q}`,
    'f_png',
  ];
  const url = `https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/${parts.join(',')}/${idOrPublicId}.png`;
  try {
    const buf = await fetchBufferWithSignedRetry(url, {
      responseType: 'arraybuffer',
      timeout: 6000,
    });
    return buf;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────
 * Drawing helpers
 * ───────────────────────────────────────────────────────── */
function drawWatermark(doc, text) {
  if (!text) return;
  const cx = doc.page.width / 2;
  const cy = doc.page.height / 2;
  doc.save();
  doc.opacity(0.08);
  doc.fillColor('#0F172A');
  doc.rotate(-24, { origin: [cx, cy] });
  doc
    .fontSize(100)
    .text(text, cx - 320, cy - 50, { width: 640, align: 'center' });
  doc.restore();
}

function header(doc, brandName, logoPng, margin) {
  const topY = margin;
  if (logoPng) doc.image(logoPng, margin + 4, topY, { width: 46 });
  doc
    .fontSize(16)
    .fillColor('#0F172A')
    .text(brandName || 'DayBreak Academy', margin + 58, topY + 4, {
      width: 420,
      align: 'left',
      lineBreak: false,
    });
  // Top rule
  doc
    .moveTo(margin, topY + 54)
    .lineTo(doc.page.width - margin, topY + 54)
    .lineWidth(0.8)
    .strokeColor('#E5EAF1')
    .stroke();

  // Guide rails
  doc.save();
  doc.strokeColor('#F1F5F9').lineWidth(0.8);
  doc
    .moveTo(margin, topY + 60)
    .lineTo(margin, doc.page.height - margin)
    .stroke();
  doc
    .moveTo(doc.page.width - margin, topY + 60)
    .lineTo(doc.page.width - margin, doc.page.height - margin)
    .stroke();
  doc.restore();
}

/** Single-line fitter with ellipsis */
function fitOneLine(doc, text, maxWidth, fontSize = 10) {
  const ellipsis = '…';
  let t = String(text ?? '');
  doc.fontSize(fontSize);
  if (doc.widthOfString(t) <= maxWidth) return t;
  while (t.length && doc.widthOfString(t + ellipsis) > maxWidth) {
    t = t.slice(0, -1);
  }
  return t + ellipsis;
  
}

  
function toFiniteNumberOrNull(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOutlineTitle(s) {
  let t = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  // mild cleanup to pack more per row
  t = t.replace(/^(week|module|unit|lesson)\s*\d+\s*[:\-–]\s*/i, '');
  t = t.replace(/^\d+\s*[:\-–]\s*/, '');
  return t.trim();
}

/**
 * Compact outline block:
 * - packs multiple outline titles per row
 * - tries smaller font sizes until it fits <= maxRows
 * - never renders more than maxRows lines
 */
function drawCompactOutlineBlock(
  doc,
  titles,
  { x, y, width, maxRows = 10, radius = 10 } = {},
) {
  const list = (Array.isArray(titles) ? titles : [])
    .map(normalizeOutlineTitle)
    .filter(Boolean);

  if (!list.length) return y;

  const padX = 10;
  const padY = 8;
  const headerH = 22;
  const maxTextW = width - padX * 2;

  const packLines = (fontSize) => {
    doc.font('Helvetica').fontSize(fontSize);
    const sep = '   '; // spaces pack better than bullets for width
    const lines = [];
    let line = '';

    for (let i = 0; i < list.length; i++) {
      const tokenRaw = `• ${list[i]}`;
      const token =
        doc.widthOfString(tokenRaw) > maxTextW
          ? fitOneLine(doc, tokenRaw, maxTextW, fontSize)
          : tokenRaw;

      if (!line) {
        line = token;
        continue;
      }

      const candidate = `${line}${sep}${token}`;
      if (doc.widthOfString(candidate) <= maxTextW) {
        line = candidate;
      } else {
        lines.push(line);
        line = token;
      }
    }
    if (line) lines.push(line);
    return lines;
  };

  // Try to fit all titles within maxRows by shrinking font
  let fontSize = 9;
  let lines = packLines(fontSize);
  while (lines.length > maxRows && fontSize > 6) {
    fontSize -= 0.5;
    lines = packLines(fontSize);
  }

  // If still too many lines, clamp to maxRows and add a final overflow hint
  let shown = lines;
  let overflow = 0;
  if (lines.length > maxRows) {
    shown = lines.slice(0, maxRows);
    overflow = lines.length - maxRows;
    // Replace last line with an explicit hint (keeps <= maxRows)
    doc.font('Helvetica').fontSize(fontSize);
    shown[maxRows - 1] = fitOneLine(
      doc,
      `… +${overflow} more (scan QR for full details)`,
      maxTextW,
      fontSize,
    );
  }

  const rowH = Math.max(10, fontSize + 4);
  const boxH = headerH + padY + shown.length * rowH + padY;

  doc.save();
  doc
    .roundedRect(x, y, width, boxH, radius)
    .fillOpacity(0.06)
    .fill('#60A5FA')
    .fillOpacity(1);

  doc.roundedRect(x, y, width, headerH, radius).fill('#E5F3FF');
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Course Outline', x + padX, y + 5, { lineBreak: false });

  // count on the right
  doc
    .fillColor('#64748B')
    .font('Helvetica')
    .fontSize(10)
    .text(`${list.length} items`, x, y + 6, { width: width - padX, align: 'right' });

  // lines
  doc.font('Helvetica').fontSize(fontSize).fillColor('#0B1220');
  let ty = y + headerH + padY;
  for (const ln of shown) {
    doc.text(ln, x + padX, ty, { width: maxTextW, lineBreak: false });
    ty += rowH;
  }
  doc.restore();

  return y + boxH;
}


/** Tight footer that never wraps or causes a new page */
function drawTightFooter(doc, brandName, { margin = 28, dryRun = false } = {}) {
  const site = 'daybreaklearner.com';
  let text = `${brandName || 'DayBreak Academy'} • ${site}`;

  const maxWidth = doc.page.width - 2 * margin;
  let size = 9;
  const minSize = 6;
  doc.font('Helvetica');
  while (size >= minSize) {
    doc.fontSize(size);
    if (doc.widthOfString(text) <= maxWidth) break;
    size -= 0.5;
  }
  if (doc.widthOfString(text) > maxWidth) {
    const initials =
      (brandName || 'DayBreak Academy')
        .split(/\s+/)
        .filter(Boolean)
        .map((s) => s[0]?.toUpperCase())
        .slice(0, 3)
        .join('') || 'DBA';
    text = `${initials} • ${site}`;
  }

  const w = doc.widthOfString(text);
  const lineH = doc.currentLineHeight();
  const x = Math.max(margin, (doc.page.width - w) / 2);
  const y = doc.page.height - margin - lineH - 2;
  if (!dryRun) doc.fillColor('#6B7280').text(text, x, y, { lineBreak: false });
  return { height: lineH, y, textWidth: w, fontSize: size };
}

/** Creative compact key/value table */
function drawMetaTable(
  doc,
  rows,
  { x, y, width, rowH = 22, headerH = 22, keyColW = 120, radius = 8 } = {},
) {
  const totalH = headerH + rows.length * rowH;
  // Background
  doc.save();
  doc
    .roundedRect(x, y, width, totalH, radius)
    .fillOpacity(0.06)
    .fill('#93C5FD'); // blue tint
  doc.fillOpacity(1);

  // Header bar
  doc.roundedRect(x, y, width, headerH, radius).fill('#E5F3FF');
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Student Information', x + 10, y + 5, { lineBreak: false });

  // Grid lines
  doc.strokeColor('#D0E3F8').lineWidth(0.6);
  // vertical key/value divider
  doc
    .moveTo(x + keyColW, y + headerH)
    .lineTo(x + keyColW, y + totalH)
    .stroke();

  // rows + zebra
  for (let i = 0; i < rows.length; i++) {
    const ry = y + headerH + i * rowH;
    if (i % 2 === 1) {
      doc
        .rect(x, ry, width, rowH)
        .fillOpacity(0.04)
        .fill('#60A5FA')
        .fillOpacity(1);
    }
    // row separators
    doc
      .moveTo(x, ry)
      .lineTo(x + width, ry)
      .stroke();
    // key/value
    const { k, v } = rows[i];
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#64748B')
      .text(k, x + 10, ry + 5, { width: keyColW - 16, lineBreak: false });
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#0B1220')
      .text(v, x + keyColW + 10, ry + 4, {
        width: width - keyColW - 20,
        ellipsis: true,
      });
  }
  // bottom line
  doc
    .moveTo(x, y + totalH)
    .lineTo(x + width, y + totalH)
    .stroke();
  doc.restore();

  return y + totalH; // bottom y
}

/** Bolden signature rendering */
function drawBoldSignature(doc, imgBuffer, x, y, { width, boldenPt = 0.6 }) {
  if (!imgBuffer) return;
  const offsets = [
    [-boldenPt, 0],
    [boldenPt, 0],
    [0, -boldenPt],
    [0, boldenPt],
    [-boldenPt, -boldenPt],
    [boldenPt, -boldenPt],
    [-boldenPt, boldenPt],
    [boldenPt, boldenPt],
  ];
  for (const [dx, dy] of offsets)
    doc.image(imgBuffer, x + dx, y + dy, { width });
  doc.image(imgBuffer, x, y, { width }); // crisp pass
}

/** Registrar signature block */
function drawRegistrarSignature(
  doc,
  {
    x = 70,
    y,
    width = 170,
    lineW = 200,
    brandName = 'Registrar',
    signaturePng,
  },
) {
  const sigY = y;
  if (signaturePng)
    drawBoldSignature(doc, signaturePng, x + 10, sigY - 6, {
      width,
      boldenPt: 0.6,
    });

  const lineY = sigY + 52;
  doc
    .moveTo(x, lineY)
    .lineTo(x + lineW, lineY)
    .lineWidth(1.1)
    .strokeColor('#9CA3AF')
    .stroke();
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#374151')
    .text(`${brandName} Registrar`, x, lineY + 10, {
      width: lineW,
      align: 'center',
      lineBreak: false,
    });

  return lineY + 28; // bottom y of block
}
// ─────────────────────────────────────────────────────────
// Program Track badge (simple + premium)
// ─────────────────────────────────────────────────────────
const TRACK_META = {
  certificate: {
    label: 'Certificate Program',
    short: 'C',
    tint: '#1D4ED8',
    bg: '#DBEAFE',
  },
  diploma: {
    label: 'Professional Program',
    short: 'P',
    tint: '#047857',
    bg: '#D1FAE5',
  },
  degree: {
    label: 'Comprehensive Program',
    short: 'M',
    tint: '#6D28D9',
    bg: '#EDE9FE',
  },
  module: {
    label: 'Module Track',
    short: 'U',
    tint: '#334155',
    bg: '#E2E8F0',
  },
};

function normalizeTrackKey(v) {
  const k = String(v || '').trim().toLowerCase();
  return TRACK_META[k] ? k : null;
}

function drawProgramTrackPill(doc, programTrack, { x, y, align = 'right', maxWidth = 260 } = {}) {
  const key = normalizeTrackKey(programTrack);
  if (!key) return null;

  const meta = TRACK_META[key];
  const label = meta.label;

  doc.save();

  // Typography
  doc.font('Helvetica-Bold').fontSize(10);

  const padX = 10;
  const padY = 6;
  const circle = 16;
  const gap = 8;

  // Measure
  const labelW = doc.widthOfString(label);
  let pillW = padX + circle + gap + labelW + padX;
  const pillH = Math.max(22, circle + padY);

  // Clamp width (rare, but safe)
  let safeLabel = label;
  if (pillW > maxWidth) {
    doc.font('Helvetica-Bold').fontSize(9);
    safeLabel = meta.label.replace(' Program', '');
    const w2 = doc.widthOfString(safeLabel);
    pillW = padX + circle + gap + w2 + padX;
    if (pillW > maxWidth) {
      safeLabel = meta.short;
      const w3 = doc.widthOfString(safeLabel);
      pillW = padX + circle + gap + w3 + padX;
    }
  }

  const drawX = align === 'right' ? x - pillW : align === 'center' ? x - pillW / 2 : x;

  // Pill background
  doc.roundedRect(drawX, y, pillW, pillH, 999).fill(meta.bg);

  // Icon circle
  const cx = drawX + padX + circle / 2;
  const cy = y + pillH / 2;
  doc.circle(cx, cy, circle / 2).fill(meta.tint);

  // Icon letter
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(10);
  doc.text(meta.short, cx - 3.2, cy - 6.2, { lineBreak: false });

  // Label
  doc.fillColor(meta.tint).font('Helvetica-Bold').fontSize(10);
  doc.text(safeLabel, drawX + padX + circle + gap, y + (pillH - 10) / 2 - 1, {
    lineBreak: false,
  });

  doc.restore();
  return { label: meta.label, key };
}

function drawAttemptsBreakdownCard(
  doc,
  sections,
  {
    x,
    y,
    width,
    maxY,
    passMark = 70,
    radius = 10,
  } = {},
) {
  const secs = Array.isArray(sections) ? sections : [];

  // Prefer quiz-like sections only (this is where "attempts" live)
  const quizSecs = secs.filter((s) => /quiz|attempt|score/i.test(String(s?.sectionTitle || '')));
  const srcSecs = quizSecs.length ? quizSecs : secs;

  // Flatten items as "attempts"
  const attempts = srcSecs
    .flatMap((s) => (Array.isArray(s?.items) ? s.items : []))
    .filter((it) => it && (it.scorePct !== undefined || it.score_pct !== undefined));

  if (!attempts.length) return y;

  const safeMaxY = Number.isFinite(maxY) ? maxY : y + 9999;

  const headerH = 22;
  const colH = 16;
  const padX = 10;
  const padY = 8;
  const rowH = 18;

  // How many rows can we fit?
  const available = safeMaxY - (y + headerH + colH + padY * 2);
  const maxRows = Math.max(1, Math.floor(available / rowH));
  const rowsToDraw = Math.min(attempts.length, maxRows);

  const hasOverflow = attempts.length > rowsToDraw;

  const cardH =
    headerH + colH + padY * 2 + rowsToDraw * rowH + (hasOverflow ? rowH : 0);

  // If we can't even fit a small card, just return y (avoid overflow)
  if (y + cardH > safeMaxY) return y;

  // Card background
  doc.save();
  doc
    .roundedRect(x, y, width, cardH, radius)
    .fillOpacity(0.06)
    .fill('#93C5FD')
    .fillOpacity(1);

  // Header bar
  doc.roundedRect(x, y, width, headerH, radius).fill('#E5F3FF');

  // Title (left) + Attempts count (right)
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text('Breakdown', x + padX, y + 5, { lineBreak: false });

  doc
    .fillColor('#64748B')
    .font('Helvetica')
    .fontSize(10)
    .text(`Attempts: ${attempts.length}`, x, y + 6, {
      width: width - padX,
      align: 'right',
      lineBreak: false,
    });

  // Column headers
  const tx = x + padX;
  const ty = y + headerH + 4;

  const attemptColW = 100;
  const scoreColW = 70;
  const resultColW = 70;
  const gap = 10;
  const detailsColW = Math.max(
    0,
    width - padX * 2 - attemptColW - scoreColW - resultColW - gap * 2,
  );

  doc.strokeColor('#D0E3F8').lineWidth(0.6);
  doc.moveTo(x, y + headerH).lineTo(x + width, y + headerH).stroke();

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#475569')
    .text('Attempt', tx, ty, { width: attemptColW, lineBreak: false });

  if (detailsColW >= 60) {
    doc.text('Details', tx + attemptColW + gap, ty, {
      width: detailsColW,
      lineBreak: false,
    });
  }

  doc.text('Score', tx + attemptColW + gap + detailsColW + gap, ty, {
    width: scoreColW,
    align: 'right',
    lineBreak: false,
  });

  doc.text('Result', tx + attemptColW + gap + detailsColW + gap + scoreColW + gap, ty, {
    width: resultColW,
    align: 'right',
    lineBreak: false,
  });

  // Rows
  let ry = y + headerH + colH + padY;

  for (let i = 0; i < rowsToDraw; i++) {
    const it = attempts[i];

    const score = toFiniteNumberOrNull(it.scorePct ?? it.score_pct);
    const scoreText = score == null ? '—' : `${Math.round(score * 100) / 100}%`;

    const pm = toFiniteNumberOrNull(passMark) ?? 70;
    const passed = score != null ? score >= pm : false;

    // zebra
    if (i % 2 === 1) {
      doc
        .rect(x + 1, ry - 2, width - 2, rowH)
        .fillOpacity(0.04)
        .fill('#60A5FA')
        .fillOpacity(1);
    }

    const attemptLabel = i === 0 ? 'Attempt 1' : `Attempt ${i + 1}`;
    const detailRaw = String(it.label || '').trim();
    const detail = detailRaw && detailRaw.toLowerCase() !== 'quiz' ? detailRaw : '';

    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#0B1220')
      .text(attemptLabel, tx, ry, { width: attemptColW, lineBreak: false });

    if (detailsColW >= 60) {
      const d = detail ? fitOneLine(doc, detail, detailsColW, 10) : '—';
      doc
        .fillColor('#334155')
        .text(d, tx + attemptColW + gap, ry, {
          width: detailsColW,
          lineBreak: false,
        });
    }

    doc
      .fillColor('#111827')
      .text(scoreText, tx + attemptColW + gap + detailsColW + gap, ry, {
        width: scoreColW,
        align: 'right',
        lineBreak: false,
      });

    doc
      .font('Helvetica-Bold')
      .fillColor(passed ? '#16A34A' : '#DC2626')
      .text(passed ? 'PASS' : 'FAIL', tx + attemptColW + gap + detailsColW + gap + scoreColW + gap, ry, {
        width: resultColW,
        align: 'right',
        lineBreak: false,
      });

    ry += rowH;
  }

  if (hasOverflow) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6B7280')
      .text(`… +${attempts.length - rowsToDraw} more attempts (scan QR to verify online)`, tx, ry, {
        width: width - padX * 2,
        lineBreak: false,
      });
  }

  doc.restore();
  return y + cardH;
}


/* ─────────────────────────────────────────────────────────
 * Main generator (ONE PAGE)
 * ───────────────────────────────────────────────────────── */
export async function generateTranscriptPdfBuffer({
  brand = {
    name: process.env.CERT_BRAND_NAME || 'DayBreak Academy',
    logoPublicId: process.env.CERT_LOGO_PUBLIC_ID,
    signaturePublicId: process.env.CERT_SIGNATURE_PUBLIC_ID, // registrar
  },
  studentName,
  studentId,
  courseTitle,
  courseId,
  programTrack,
  issuedAt = new Date(),
  overallPct = null,
  passMark = 70,
  sections = [],
  verificationUrl,
  previewNote = false,
  watermarkText = null,

  // Inputs for “Lessons Learnt”
  lessonsLearnt = [],
  outline = [],
}) {
  const MARGIN = 28; // also used as visual rails
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN });
  doc.on('pageAdded', () =>
    console.warn('[transcript] pageAdded → content overflow'),
  );

  // Assets
  const [logoPng, registrarSigPng] = await Promise.all([
    fetchCloudinaryAsPngBuffer(brand.logoPublicId, { w: 160 }),
    fetchSignaturePngBuffer(brand.signaturePublicId, { w: 680 }).catch(
      () => null,
    ),
  ]);

  // QR (hi-res gen, draw smaller)
  let qrBuffer = null;
  if (verificationUrl) {
    try {
      qrBuffer = await QRCode.toBuffer(verificationUrl, {
        type: 'png',
        width: 120,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch {}
  }

  // Helpers
  const pageBottom = () => doc.page.height - MARGIN;
  const contentLeft = () => MARGIN;
  const contentRight = () => doc.page.width - MARGIN;
  const contentWidth = () => contentRight() - contentLeft();

  const bufs = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', (b) => bufs.push(b));
    doc.on('end', () => resolve(Buffer.concat(bufs)));
    doc.on('error', reject);

    // Meta
    try {
      doc.info = {
        Title: `Transcript - ${studentName}`,
        Author: brand.name || 'Transcript Generator',
        Subject: `Transcript for ${courseTitle}`,
        Keywords: 'transcript, results',
        Creator: 'TutorApp',
        CreationDate: new Date(),
      };
    } catch {}

    // Watermark
    if (watermarkText) drawWatermark(doc, watermarkText);

    // Header + rails
    header(doc, brand.name, logoPng, MARGIN);

    // Title
    let y = MARGIN + 68;
    doc
      .fillColor('#0F172A')
      .fontSize(18)
      .text('Official Transcript', contentLeft() + 4, y, { lineBreak: false });

      drawProgramTrackPill(doc, programTrack, {
        x: contentRight() - 4,
        y: y - 2,
        align: 'right',
        maxWidth: 280,
      });
    if (previewNote) {
      doc
        .fontSize(10)
        .fillColor('#374151')
        .text(
          '(Preview – watermark removed after payment)',
          contentLeft() + 4,
          y + 16,
          { lineBreak: false },
        );
    }

    // ── Student Info Table (with extra spacing) ─────────────────────────────
    y += previewNote ? 44 : 28;
    const issuedText = (
      issuedAt instanceof Date ? issuedAt : new Date(issuedAt)
    ).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    // Build a list of "Lessons Learnt" labels from titles only
    function coerceLabels(arr) {
      return (Array.isArray(arr) ? arr : [])
        .map((x) => (typeof x === 'string' ? x : x?.title || x?.label || ''))
        .map((s) => String(s).trim())
        .filter(Boolean);
    }

    // 1) explicit list from caller (if provided)
    const fromExplicit = coerceLabels(lessonsLearnt);

    // 2) else derive from outline: **titles only**
    const fromOutline = (Array.isArray(outline) ? outline : [])
      .map((s) => String(s?.title || '').trim())
      .filter(Boolean);

    // 3) final fallback: if someone shoved an “Outline/Lessons Learnt” into sections
    const fromSections = (() => {
      const sec = Array.isArray(sections)
        ? sections.find((s) =>
            /outline|lessons?\s*learnt/i.test(String(s?.sectionTitle || '')),
          )
        : null;
      return coerceLabels(sec?.items);
    })();

    
   // De-dup titles (preserve order), DO NOT cap here — we will compact-render below.
    const rawAll = (fromExplicit.length ? fromExplicit : fromOutline.length ? fromOutline : fromSections)
      .map((s) => String(s || '').trim())
      .filter(Boolean);
    const seen = new Set();
    const outlineTitles = [];
    for (const t of rawAll) {
      const key = t.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        outlineTitles.push(t);
      }
    }

    const trackKey = normalizeTrackKey(programTrack);
const trackLabel = trackKey ? TRACK_META[trackKey]?.label : null;


      // --- build meta rows (keep table compact) ---
    const baseMeta = [
      { k: 'Student Name', k2: 'student_name', v: studentName || '—' },
      { k: 'Student ID', k2: 'student_id', v: studentId || '—' },
      { k: 'Course', k2: 'course', v: courseTitle || '—' },
       ...(trackLabel ? [{ k: 'Program Track', k2: 'program_track', v: trackLabel }] : []),
      { k: 'Course ID', k2: 'course_id', v: courseId || '—' },
    ];

    const metaRows = [...baseMeta, { k: 'Issued On', k2: 'issued_on', v: issuedText }];

    const tableBottom = drawMetaTable(doc, metaRows, {
      x: contentLeft() + 4,
      y,
      width: contentWidth() - 8,
      keyColW: 130,
      rowH: 22,
      headerH: 22,
    });

      // Add compact outline block (<=10 rows, multiple per row)
    y = tableBottom + 12;
    y = drawCompactOutlineBlock(doc, outlineTitles, {
      x: contentLeft() + 4,
      y,
      width: contentWidth() - 8,
      maxRows: 50,
      radius: 10,
    }) + 16;

    

    // ── Summary box ─────────────────────────────────────────────────────────
    const overallN = toFiniteNumberOrNull(overallPct);
    const passN = toFiniteNumberOrNull(passMark);

const scoreText = overallN == null ? '—' : `${Math.round(overallN * 100) / 100}%`;
const passText = passN == null ? '—' : `${Math.round(passN * 100) / 100}%`;

    const boxY = y;
    const boxW = contentWidth() - 8;
    const boxH = 56;
    doc
      .roundedRect(contentLeft() + 4, boxY, boxW, boxH, 10)
      .fillOpacity(0.06)
      .fill('#16A34A')
      .fillOpacity(1);

    doc
      .fillColor('#065F46')
      .fontSize(11)
      .text('Final Score', contentLeft() + 18, boxY + 12, { lineBreak: false });
    doc
      .fontSize(24)
      .fillColor('#064E3B')
     .text(scoreText, contentLeft() + 18, boxY + 28, {
  lineBreak: false,
});

doc
  .fillColor('#065F46')
  .fontSize(11)
  .text('Pass Mark', contentLeft() + 210, boxY + 12, { lineBreak: false });

doc
  .fontSize(18)
  .fillColor('#111827')
  .text(passText, contentLeft() + 210, boxY + 28, { lineBreak: false });


 const letter =
      overallN == null
        ? '—'
        : overallN >= 90
          ? 'A'
          : overallN >= 80
            ? 'B'
            : overallN >= 70
              ? 'C'
              : overallN >= 60
                ? 'D'
                : 'F';

    doc
      .fillColor('#6B7280')
      .fontSize(10)
      .text('Letter Grade', contentLeft() + 360, boxY + 12, {
        lineBreak: false,
      });
    doc
      .fontSize(18)
      .fillColor('#111827')
      .text(letter, contentLeft() + 360, boxY + 28, { lineBreak: false });

    y = boxY + boxH + 24;

    // ---- PRE-COMPUTE BOTTOM BLOCK SIZES (footer + QR)
const { height: footerH } = drawTightFooter(doc, brand.name, {
  margin: MARGIN,
  dryRun: true,
});

const qrSize = qrBuffer ? 82 : 0;
doc.font('Helvetica').fontSize(9);
const labelH = doc.currentLineHeight();
const reservedBottomH =
  (qrSize ? qrSize + 2 + labelH : 0) + 4 + footerH + 6;
const maxContentY = pageBottom() - reservedBottomH;

// Reserve space for signature block (~80px) so breakdown never pushes it into the QR/footer.
const SIG_H = 84;
const maxBreakdownY = maxContentY - SIG_H - 8;

// ── Breakdown (Attempts + Scores) BEFORE signature ─────────────────────────
const breakdownBottom = drawAttemptsBreakdownCard(doc, sections, {
  x: contentLeft() + 4,
  y,
  width: contentWidth() - 8,
  maxY: maxBreakdownY,
  passMark: passN ?? 70,
  radius: 10,
});

y = breakdownBottom ? breakdownBottom + 14 : y;


    // ── Registrar Signature ─────────────────────────────────────────────────
    const registrarBottom = drawRegistrarSignature(doc, {
      x: contentLeft() + 40,
      y,
      width: 170,
      lineW: 210,
      brandName: brand.name || 'DayBreak Academy',
      signaturePng: registrarSigPng,
    });
    y = registrarBottom + 10;

    
       // ---- Bottom: QR (left) + Footer (center) ──────────────────────────────
    if (qrBuffer) {
      const qrY = pageBottom() - (footerH + 6) - 4 - labelH - 2 - qrSize;
      doc.image(qrBuffer, contentLeft() + 4, qrY, {
        width: qrSize,
        height: qrSize,
      });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6B7280')
        .text('Scan to verify', contentLeft() + 4, qrY + qrSize + 2, {
          width: qrSize,
          align: 'center',
          lineBreak: false,
        });
    }

    // Footer (draw last; one-line, no frame)
    drawTightFooter(doc, brand.name, { margin: MARGIN });

    // Done
    doc.end();
  });
}
