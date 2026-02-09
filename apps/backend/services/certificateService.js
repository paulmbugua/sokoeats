// Certificate PDF generator (JS / ESM)
// - Brand name: Libre Baskerville Bold 700 (large, single line fit)
// - Student name: Style Script (modern calligraphy), sits on underline
// - Locks signature thickness using Cloudinary e_trim + oversampling + fixed draw widths
// - Reduced vertical gap between signatures and underline
// - Extra: bolden signatures by layering slight offsets

import PDFDocument from 'pdfkit';
import axios from 'axios';
import QRCode from 'qrcode';
import cloudinary from './cloudinaryShim.js';
import { fetchAssetBuffer } from '../utils/fetchAssetBuffer.js';
import crypto from 'node:crypto';
import crc32 from 'crc-32';

/** Cloud name from env (supports both names) */
const CLOUDINARY_CLOUD_NAME = (
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_NAME ||
  ''
).trim();

/* ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */

const oneline = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

function getOrgInitials(name) {
  const parts = oneline(name)
    .split(/[^A-Za-z]+/)
    .filter(Boolean);
  if (!parts.length) return 'X';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] + parts[1][0] + parts[2][0]).toUpperCase();
}

const sha1Hex = (s) =>
  crypto.createHash('sha1').update(oneline(s)).digest('hex');

/** 2-digit checksum from CRC-32 % 97 (01..97) */
function crc32Mod97(input) {
  const u32 = crc32.str(oneline(input)) >>> 0;
  const mod = u32 % 97;
  const chk = mod === 0 ? 97 : mod;
  return String(chk).padStart(2, '0');
}

/** Final format: AA-NNNNNNCC (AA=org initials, N=6 digits, CC=2-digit checksum) */
export function generateCertificateNumber({
  brandName,
  studentName,
  courseTitle,
  issuedAt,
}) {
  const initials = getOrgInitials(brandName);
  const issuedStr =
    issuedAt instanceof Date
      ? issuedAt.toISOString().slice(0, 10)
      : oneline(issuedAt || '');
  const seed = `${oneline(brandName)}||${oneline(studentName)}||${oneline(courseTitle)}||${issuedStr}`;

  const hex = sha1Hex(seed);
  const tail6 = String(parseInt(hex.slice(0, 8), 16) % 1_000_000).padStart(
    6,
    '0',
  );
  const chk2 = crc32Mod97(seed);

  return `${initials}-${tail6}${chk2}`.toUpperCase();
}

/** Draw single-line centered text with a custom underline (better control than PDFKit's underline) */
function drawCenteredUnderlinedText(
  doc,
  text,
  {
    font,
    size,
    x,
    y,
    width,
    color = '#0B1220',
    underlineOffset = 2, // ↓ closer so the name “sits” on the line
    underlineThickness = 1.8, // slightly heavier so it reads as a base line
  },
) {
  if (!text) return { lineY: y, textWidth: 0 };

  doc.save();
  doc.font(font).fontSize(size).fillColor(color);

  const textWidth = doc.widthOfString(text);
  const textX = x + Math.max(0, (width - textWidth) / 2);

  // Render the text (no wrapping)
  doc.text(text, x, y, { width, align: 'center', lineBreak: false });

  // Custom underline (just hugging the glyphs)
  const lineY = y + doc.currentLineHeight() - underlineOffset;
  doc
    .moveTo(textX, lineY)
    .lineTo(textX + textWidth, lineY)
    .lineWidth(underlineThickness)
    .strokeColor(color)
    .stroke();

  doc.restore();
  return { lineY, textWidth };
}

/* Cloudinary fetching with optional signed retry */
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

  const xerr = first.headers?.['x-cld-error'];
  console.warn('[cert] fetchBufferWithSignedRetry failed', {
    status: first.status,
    x_cld_error: xerr,
    url,
  });
  return null;
}

/**
 * Accepts Cloudinary public_id OR full URL; returns PNG buffer or null
 * Options:
 *  - trim: apply Cloudinary e_trim (stabilizes thickness)
 *  - exact: use c_scale to force exact width; otherwise c_limit
 *  - dpr: device pixel ratio hint
 */
async function fetchCloudinaryAsPngBuffer(idOrUrl) {
  if (!idOrUrl) return null;
  return fetchAssetBuffer(idOrUrl, { resourceType: 'image' });
}

/* Decorative elements */
function drawWavyBackground(doc) {
  const { width, height } = doc.page;
  doc.save();
  doc.fillColor('#E8F1FB');
  doc.opacity(0.75);
  doc.moveTo(0, 140);
  doc.bezierCurveTo(width * 0.15, 60, width * 0.35, 220, width * 0.55, 120);
  doc.bezierCurveTo(width * 0.75, 40, width * 0.95, 140, width, 90);
  doc.lineTo(width, 0).lineTo(0, 0).closePath().fill();
  doc.restore();

  doc.save();
  doc.fillColor('#E6FAF4');
  doc.opacity(0.65);
  doc.moveTo(0, height - 140);
  doc.bezierCurveTo(
    width * 0.2,
    height - 60,
    width * 0.5,
    height - 220,
    width * 0.75,
    height - 110,
  );
  doc.bezierCurveTo(
    width * 0.9,
    height - 60,
    width,
    height - 100,
    width,
    height,
  );
  doc.lineTo(0, height).closePath().fill();
  doc.restore();

  doc.save();
  doc.lineWidth(2).strokeColor('#E5E7EB');
  doc.roundedRect(32, 32, width - 64, height - 64, 10).stroke();
  doc.restore();
}

function drawWatermark(doc, raw) {
  const text = oneline(raw);
  if (!text) return;
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height / 2 + 10;
  doc.save();
  doc.opacity(0.08);
  doc.fillColor('#0F172A');
  doc.rotate(-18, { origin: [centerX, centerY] });
  doc.fontSize(72).text(text, centerX - 220, centerY - 40, {
    width: 440,
    align: 'center',
    lineBreak: false,
  });
  doc.restore();
}

/** Footer cert number */
function drawFooterCertificateNumber(
  doc,
  certNumber,
  {
    y = 740,
    size = 13,
    opacity = 0.28,
    tracking = 0.6,
    font = 'Helvetica-Bold',
  } = {},
) {
  if (!certNumber) return;
  const label = `Cert. No: ${oneline(certNumber)}`;
  doc.save();
  doc.font(font).fontSize(size).fillColor('#0B1220').opacity(opacity);
  const w = doc.widthOfString(label) + tracking * Math.max(0, label.length - 1);
  const x = (doc.page.width - w) / 2;
  doc.text(label, x, y, { lineBreak: false, characterSpacing: tracking });
  doc.restore();
}

/* Signatures boldener */
function drawBoldSignature(doc, imgBuffer, x, y, { width, boldenPt = 0.7 }) {
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
  doc.image(imgBuffer, x, y, { width }); // crisp top pass
}

/* Keep brand name on a single line and auto-fit if necessary */
function drawBrandNameSingleLine(
  doc,
  text,
  {
    x,
    y,
    font,
    maxWidth = 360,
    maxSize = 40,
    minSize = 22,
    charSpacingStart = 0.2,
  },
) {
  if (!text) return;
  const measure = (size, cs) => {
    const base = doc.font(font).fontSize(size).widthOfString(text);
    const extra = Math.max(0, text.length - 1) * (cs || 0);
    return base + extra;
  };
  let size = maxSize;
  let cs = charSpacingStart;
  let w = measure(size, cs);
  if (w > maxWidth) {
    const scaled = Math.floor(size * (maxWidth / w));
    size = Math.max(minSize, Math.min(maxSize, scaled));
    w = measure(size, cs);
  }
  if (w > maxWidth && cs > 0) {
    cs = 0;
    w = measure(size, cs);
    if (w > maxWidth) {
      const scaled = Math.floor(size * (maxWidth / w));
      size = Math.max(minSize, Math.min(size, scaled));
    }
  }
  doc.font(font).fontSize(size).fillColor('#0F172A').text(text, x, y, {
    lineBreak: false,
    width: maxWidth,
    align: 'left',
    characterSpacing: cs,
  });
}

// ─────────────────────────────────────────────────────────
// Program Track badge (same as transcriptService)
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

  // accept your public names too (same mapping you use in native/web)
  if (k === 'professional') return 'diploma';
  if (k === 'comprehensive') return 'degree';

  return TRACK_META[k] ? k : null;
}

function drawProgramTrackPill(
  doc,
  programTrack,
  { x, y, align = 'right', maxWidth = 260 } = {},
) {
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

  const drawX =
    align === 'right' ? x - pillW : align === 'center' ? x - pillW / 2 : x;

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
  doc.text(
    safeLabel,
    drawX + padX + circle + gap,
    y + (pillH - 10) / 2 - 1,
    { lineBreak: false },
  );

  doc.restore();
  return { label: meta.label, key, height: pillH };
}


/* ─────────────────────────────────────────────────────────
 * PDF generator (single page)
 * ───────────────────────────────────────────────────────── */

export async function generateCertificatePdfBuffer({
  studentName,
  courseTitle,
   programTrack,
  issuedAt = new Date(),
  verificationUrl,
  titleText,
  certificateNumber,
  brand = {
    name: process.env.CERT_BRAND_NAME || 'DayBreak Academy',
    logoPublicId: process.env.CERT_LOGO_PUBLIC_ID,
    signaturePublicId: process.env.CERT_SIGNATURE_PUBLIC_ID,
  },
  tutorSignaturePublicId,
  fonts = {
    brand:
      process.env.CERT_BRAND_FONT_PATH || './uploads/LibreBaskerville-Bold.ttf',
    calligraphy:
      process.env.CERT_STUDENT_FONT_PATH || './uploads/StyleScript-Regular.ttf',
  },
  showBrandText = 'always',
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

  // Fonts
  const BRAND_FONT_NAME = 'LibreBaskervilleBold';
  const CALLIG_FONT_NAME = 'StyleScript';
  let brandFont = 'Helvetica-Bold';
  let calligFont = 'Times-Roman';
  try {
    if (fonts?.brand) {
      doc.registerFont(BRAND_FONT_NAME, fonts.brand);
      brandFont = BRAND_FONT_NAME;
    }
  } catch {}
  try {
    if (fonts?.calligraphy) {
      doc.registerFont(CALLIG_FONT_NAME, fonts.calligraphy);
      calligFont = CALLIG_FONT_NAME;
    }
  } catch {}

  // One page only
  doc.on('pageAdded', () =>
    console.warn('[cert] WARNING: pageAdded → content overflow'),
  );

  // Metadata
  try {
    doc.info = {
      Title: `Certificate - ${oneline(studentName)}`,
      Author: oneline(brand?.name) || 'Certificate Generator',
      Subject: `Completion: ${oneline(courseTitle)}`,
      Keywords: 'certificate, completion',
      Creator: 'TutorApp',
      CreationDate: new Date(),
    };
  } catch {}

  const effectiveCertNumber =
    oneline(certificateNumber) ||
    generateCertificateNumber({
      brandName: brand?.name,
      studentName,
      courseTitle,
      issuedAt,
    });

  // Sizes
  const LOGO_PT = 68;
  const SIG_REG_PT = 150;
  const SIG_TUTOR_PT = 170;
  const FETCH_SCALE = 4;
  const SIG_BOLDEN_PT = 0.6;
  const rawStudent = oneline(studentName);
  const STUDENT_X = 50;
  const STUDENT_W = 495;
  const STUDENT_SIZE_BASE = Number(process.env.CERT_STUDENT_NAME_SIZE || 44);
  const STUDENT_SIZE =
    rawStudent.length > 28 ? Math.max(34, STUDENT_SIZE_BASE - 8) : STUDENT_SIZE_BASE;

  // Assets
  const [logoPng, brandSignaturePng, tutorSignaturePng] = await Promise.all([
    fetchCloudinaryAsPngBuffer(brand?.logoPublicId || null, {
      w: Math.round(LOGO_PT * FETCH_SCALE),
      exact: true,
      dpr: 2,
      q: 'auto:good',
    }),
    fetchCloudinaryAsPngBuffer(brand?.signaturePublicId || null, {
      w: Math.round(SIG_REG_PT * FETCH_SCALE),
      trim: true,
      exact: true,
      dpr: 2,
      q: 'auto:good',
    }),
    fetchCloudinaryAsPngBuffer(tutorSignaturePublicId || null, {
      w: Math.round(SIG_TUTOR_PT * FETCH_SCALE),
      trim: true,
      exact: true,
      dpr: 2,
      q: 'auto:good',
    }),
  ]);

  // QR
  let qrPngBuffer = null;
  if (verificationUrl) {
    try {
      qrPngBuffer = await QRCode.toBuffer(verificationUrl, {
        type: 'png',
        width: 120,
        margin: 1,
        errorCorrectionLevel: 'M',
      });
    } catch (e) {
      console.warn('[cert] QR generation failed', e?.message);
    }
  }

  // Buffer stream
  const chunks = [];
  return await new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Background & frame
    drawWavyBackground(doc);

    // Header (logo + brand, single-line fit)
    const wantBrandText =
      showBrandText === 'always' || (showBrandText === 'auto' && !logoPng);
    if (logoPng) doc.image(logoPng, 58, 46, { width: LOGO_PT });
    if (wantBrandText && oneline(brand?.name)) {
      drawBrandNameSingleLine(doc, oneline(brand.name), {
        x: 140,
        y: 48,
        font: brandFont,
        maxWidth: 360,
        maxSize: 40,
        minSize: 22,
        charSpacingStart: 0.2,
      });
    }

    // Header rule
    doc
      .moveTo(50, 120)
      .lineTo(545, 120)
      .lineWidth(1.2)
      .strokeColor('#DCE4EE')
      .stroke();

    // Watermark
    drawWatermark(doc, brand?.name);

    // Title & body
    const issuedDate =
      issuedAt instanceof Date ? issuedAt : new Date(issuedAt || new Date());
    const issuedText = issuedDate.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const headline = oneline(titleText || 'Certificate of Completion');

    const y0 = 160;
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(32)
      .text(headline, 50, y0, {
        width: 495,
        align: 'center',
        lineBreak: false,
      });

      // ✅ Program track pill (centered under headline)
     // ✅ Program track pill (centered under headline)
const PILL_Y = y0 + 40; // keep pill where it is under the headline
const pillRes = drawProgramTrackPill(doc, programTrack, {
  x: 50 + 495 / 2,
  y: PILL_Y,
  align: 'center',
  maxWidth: 320,
});

// ✅ Add spacing AFTER the pill before "This certifies that"
const GAP_AFTER_PILL = 16; // increase to 20–24 if you want more space
const certifiesY = pillRes
  ? PILL_Y + pillRes.height + GAP_AFTER_PILL
  : y0 + 40;

doc
  .font('Helvetica')
  .fontSize(14)
  .fillColor('#1F2937')
  .text('This certifies that', 50, certifiesY, {
    width: 495,
    align: 'center',
    lineBreak: false,
  });

// Student name — keep same spacing from "This certifies that"
const STUDENT_GAP_AFTER_CERTIFIES = 18;
const studentY = certifiesY + STUDENT_GAP_AFTER_CERTIFIES;


    const { lineY: studentUnderlineY } = drawCenteredUnderlinedText(
      doc,
      oneline(studentName),
      {
        font: calligFont,
        size: STUDENT_SIZE,
        x: STUDENT_X,
        y: studentY,
        width: STUDENT_W,
        color: '#0B1220',
        underlineOffset: 18, // ← positive: lifts underline to “kiss” the glyphs
        underlineThickness: 2.0,
      },
    );

    // Next lines: give the course title generous space
    const afterNameY = studentUnderlineY + 12; // spacing after underline → “has successfully…”
    const courseY = afterNameY + 30; // extra room for the title itself
    const issuedY = courseY + 46; // ↑ increased gap between “has…”/title and “Issued on”

    doc
      .font('Helvetica')
      .fontSize(14)
      .fillColor('#1F2937')
      .text('has successfully completed the course', 50, afterNameY, {
        width: 495,
        align: 'center',
        lineBreak: false,
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#0B1220')
      .text(`“${oneline(courseTitle)}”`, 50, courseY, {
        width: 495,
        align: 'center',
        lineBreak: false,
      });

    doc
      .font('Helvetica')
      .fontSize(12)
      .fillColor('#374151')
      .text(`Issued on: ${issuedText}`, 50, issuedY, {
        width: 495,
        align: 'center',
        lineBreak: false,
      });

    // Signatures row
    const bandTop = 510;
    const BRAND_SIG_Y = bandTop - 6;
    const TUTOR_SIG_Y = bandTop - 8;
    const sigLineY = bandTop + 60;
    const labelY = sigLineY + 12;

    if (brandSignaturePng) {
      drawBoldSignature(doc, brandSignaturePng, 90, BRAND_SIG_Y, {
        width: SIG_REG_PT,
        boldenPt: SIG_BOLDEN_PT,
      });
    }
    doc
      .moveTo(70, sigLineY)
      .lineTo(260, sigLineY)
      .lineWidth(1.1)
      .strokeColor('#9CA3AF')
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#374151')
      .text(`${oneline(brand?.name)} Registrar`, 70, labelY, {
        width: 190,
        align: 'center',
        lineBreak: false,
      });

    if (tutorSignaturePng) {
      drawBoldSignature(doc, tutorSignaturePng, 340, TUTOR_SIG_Y, {
        width: SIG_TUTOR_PT,
        boldenPt: SIG_BOLDEN_PT,
      });
      doc
        .moveTo(325, sigLineY)
        .lineTo(525, sigLineY)
        .lineWidth(1.1)
        .strokeColor('#9CA3AF')
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#374151')
        .text('Course Instructor', 325, labelY, {
          width: 200,
          align: 'center',
          lineBreak: false,
        });
    }

    // QR (bottom-left; safe)
    if (qrPngBuffer) {
      const qrX = 64,
        qrY = 650;
      doc.image(qrPngBuffer, qrX, qrY, { width: 92 });
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6B7280')
        .text('Scan to verify', qrX, 758, {
          width: 100,
          align: 'center',
          lineBreak: false,
        });
    }

    // Certificate number
    drawFooterCertificateNumber(doc, effectiveCertNumber, {
      y: 740,
      size: 13,
      opacity: 0.28,
      tracking: 0.6,
      font: 'Helvetica-Bold',
    });

    // Done
    doc.end();
  });
}
