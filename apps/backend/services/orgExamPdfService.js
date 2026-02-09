import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';
import axios from 'axios';
import cloudinary from './cloudinaryShim.js';
import crypto from 'node:crypto';
import crc32 from 'crc-32';

/* ─────────────────────────────────────────────────────────
 * Asset helpers (mirrors certificate service)
 * ───────────────────────────────────────────────────────── */

const CLOUDINARY_CLOUD_NAME =
  process.env.LEGACY_CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_NAME ||
  '';

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

/**
 * Final format: AA-NNNNNNCC (AA=org initials, N=6 digits, CC=2-digit checksum)
 * Deterministic based on org + learner + class + term + exam.
 */
function generateReportCardNumber({
  brandName,
  studentName,
  classLabel,
  termLabel,
  examLabel,
}) {
  const initials = getOrgInitials(brandName || 'School');
  const issuedStr = oneline(`${termLabel || ''} ${examLabel || ''}`);
  const seed = [
    oneline(brandName || ''),
    oneline(studentName || ''),
    oneline(classLabel || ''),
    issuedStr,
  ].join('||');

  const hex = sha1Hex(seed);
  const tail6 = String(parseInt(hex.slice(0, 8), 16) % 1_000_000).padStart(
    6,
    '0',
  );
  const chk2 = crc32Mod97(seed);

  return `${initials}-${tail6}${chk2}`.toUpperCase();
}

/** Footer "Report No" renderer (centered near bottom) */
function drawFooterReportNumber(
  doc,
  reportNumber,
  {
    y = 800,
    size = 9,
    opacity = 0.32,
    tracking = 0.5,
    font = 'Helvetica-Bold',
  } = {},
) {
  if (!reportNumber) return;
  const label = `Report No: ${oneline(reportNumber)}`;
  doc.save();
  doc.font(font).fontSize(size).fillColor('#0B1220').opacity(opacity);
  const w = doc.widthOfString(label) + tracking * Math.max(0, label.length - 1);
  const x = (doc.page.width - w) / 2;
  doc.text(label, x, y, {
    lineBreak: false,
    characterSpacing: tracking,
  });
  doc.restore();
}

/* Cloudinary fetching with optional signed retry (same logic as certificate) */
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

  console.warn('[examCard] fetchBufferWithSignedRetry failed', {
    status: first.status,
    x_cld_error: xerr,
    url,
  });
  return null;
}

/**
 * Accepts Cloudinary public_id OR full URL; returns PNG buffer or null
 * Options:
 *  - trim: apply Cloudinary e_trim (stabilizes thickness for signatures)
 *  - exact: use c_scale for exact width; otherwise c_limit
 *  - dpr: device pixel ratio hint
 */
async function fetchCloudinaryAsPngBuffer(
  idOrUrl,
  { w, h, q = 'auto', trim = false, exact = false, dpr = 2 } = {},
) {
  if (!idOrUrl) return null;

  // If already a full URL, just fetch (with signed retry when needed)
  if (typeof idOrUrl === 'string' && idOrUrl.includes('://')) {
    try {
      const buf = await fetchBufferWithSignedRetry(idOrUrl, {
        responseType: 'arraybuffer',
        timeout: 6000,
      });
      if (buf) return buf;
    } catch (e) {
      console.warn('[examCard] direct image fetch failed', e?.message);
    }
    return null;
  }

  // Must have cloud name to build delivery URL
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
    const status = e?.response?.status;

    console.warn('[examCard] Cloudinary fetch failed:', {
      url,
      status,
      msg: e?.message,
    });
    return null;
  }
}

/**
 * Try to load an image, preferring Cloudinary when:
 *  - value is a Cloudinary public_id, OR
 *  - value is a res.cloudinary.com URL
 * Falls back to Node 18 global fetch for arbitrary URLs.
 */
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

  // Fallback for arbitrary URLs
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
 * Existing helpers
 * ───────────────────────────────────────────────────────── */

const ordinal = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '';
  // No suffix – just the number, e.g. "1", "2", "13"
  return String(num);
};

const clampPercent = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
};

const toSentenceCase = (value) => {
  const s = (value || '').toString().trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

function buildAiExtrasMatrix(subjects) {
  if (!Array.isArray(subjects) || !subjects.length) return null;

  const keyHasValues = new Map();

  subjects.forEach((s) => {
    const extra =
      s && s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)
        ? s.extra
        : null;

    if (!extra) return;

    Object.entries(extra).forEach(([key, value]) => {
      if (key === '__meta__') return;
      if (value == null) return;
      const str = oneline(value);
      if (!str) return;
      keyHasValues.set(key, true);
    });
  });

  const extraKeys = Array.from(keyHasValues.keys()).sort();
  if (!extraKeys.length) return null;

  const rows = subjects
    .map((s) => {
      const subjectLabel = s.subject || '—';
      const extra =
        s && s.extra && typeof s.extra === 'object' && !Array.isArray(s.extra)
          ? s.extra
          : {};
      const cells = extraKeys.map((k) => {
        const raw = extra[k];
        const str = raw == null ? '' : oneline(raw);
        return str || '—';
      });

      // Skip subjects with no meaningful extras at all
      const hasAny = cells.some((c) => c !== '—');
      if (!hasAny) return null;

      return {
        subject: subjectLabel,
        cells,
      };
    })
    .filter(Boolean);

  if (!rows.length) return null;

  return {
    extraKeys,
    rows,
  };
}

/**
 * Render a single-page A4 exam report card
 * card shape is the object returned by getStudentExamCard:
 * {
 *   org: { ... },
 *   student: { ... },
 *   term: { year, label }?,
 *   session: { label }?,
 *   subjects: [...],
 *   summary: { ... },
 *   progressSeries?: [...],
 *   attendance?: { ... }
 * }
 */
export async function renderOrgExamStudentCardPdf(card) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  // Page metrics
  const pageWidth = Number(doc.page.width) || 595.28;
  const pageHeight = Number(doc.page.height) || 841.89;
  const leftMargin = Number(doc.page.margins?.left) || 40;
  const rightMargin = Number(doc.page.margins?.right) || 40;
  const innerWidth = pageWidth - leftMargin - rightMargin;

  const schoolName = (card.org && card.org.name) || 'School Report Card';
  const learnerName = card.student?.name || 'Learner';

  const termLabel = card.term ? `${card.term.year} ${card.term.label}` : '';
  const examLabel = card.session?.label || '';

  const classTeacherSig =
    card.class_teacher_signature_url || // from service
    card.instructor_signature_url || // flattened org-level instructor sig
    card.org?.instructor_signature_url || // extra safety
    null;

  // Deterministic report card number
  const reportNumber = generateReportCardNumber({
    brandName: schoolName,
    studentName: learnerName,
    classLabel: card.student?.class_label || card.summary?.classLabel || '',
    termLabel,
    examLabel,
  });

  // Pre-fetch images (logo + student photo + registrar + teacher signatures)
  const [logoBuf, photoBuf, registrarSigBuf, teacherSigBuf] = await Promise.all(
    [
      tryLoadImageBuffer(card.org?.logo_url, {
        w: 240,
        h: 240,
        trim: false,
        exact: false,
        dpr: 2,
      }),
      tryLoadImageBuffer(card.student?.photo_url, {
        w: 400,
        h: 400,
        trim: false,
        exact: false,
        dpr: 2,
      }),
      tryLoadImageBuffer(card.org?.signature_url, {
        w: 520,
        h: 200,
        trim: true,
        exact: false,
        dpr: 2,
      }),
      tryLoadImageBuffer(classTeacherSig, {
        w: 520,
        h: 200,
        trim: true,
        exact: false,
        dpr: 2,
      }),
    ],
  );

  // ───────────────────────────────── HEADER ─────────────────────────────────
  const headerHeight = 70;

  // Soft band background
  doc.save().rect(0, 0, pageWidth, headerHeight).fill('#f3f4f6').restore();

  // Logo (if any)
  if (logoBuf) {
    try {
      doc.image(logoBuf, leftMargin, 14, {
        fit: [48, 48],
        align: 'left',
        valign: 'top',
      });
    } catch {
      // ignore logo failures
    }
  }

  // School name
  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(17)
    .text(schoolName, leftMargin + (logoBuf ? 60 : 0), 18, {
      width: innerWidth - (logoBuf ? 60 : 0),
      align: 'center',
    });

  // Contact info (address + Tel/Email/Website)
  const contactBits = [card.org?.address_line1, card.org?.address_line2].filter(
    (x) => x && String(x).trim(),
  );

  const contactInlineBits = [
    card.org?.phone_number && `Tel: ${card.org.phone_number}`,
    card.org?.contact_email && `Email: ${card.org.contact_email}`,
    card.org?.website_url && `Website: ${card.org.website_url}`,
  ].filter(Boolean);

  const contactTextLines = [
    ...contactBits,
    contactInlineBits.length ? contactInlineBits.join('   •   ') : null,
  ].filter(Boolean);

  let lastContactBottomY = 32; // default baseline

  if (contactTextLines.length) {
    doc.font('Helvetica').fontSize(8).fillColor('#374151');
    contactTextLines.forEach((line, idx) => {
      const lineY = 40 + idx * 10;
      doc.text(line, leftMargin + (logoBuf ? 60 : 0), lineY, {
        width: innerWidth - (logoBuf ? 60 : 0),
        align: 'center',
      });
      lastContactBottomY = lineY + 10; // rough line height
    });
  }

  // Card title – ensure it sits BELOW contact info
  const minTitleY = headerHeight - 8;
  const titleY = Math.max(minTitleY, lastContactBottomY + 6);

  const defaultCardTitle = 'TERM REPORT CARD';
  const dynamicCardTitle =
    (card.reportTitle && oneline(card.reportTitle)) ||
    (card.settings &&
      oneline(card.settings.reportTitle || card.settings.cardTitle || '')) ||
    (card.org && oneline(card.org.exam_report_title || '')) ||
    defaultCardTitle;

  doc
    .fillColor('#111827')
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(dynamicCardTitle, leftMargin, titleY, {
      width: innerWidth,
      align: 'center',
    });

  // Separator line just under the title
  const headerRuleY = titleY + 14;

  doc
    .moveTo(leftMargin, headerRuleY)
    .lineTo(pageWidth - rightMargin, headerRuleY)
    .strokeColor('#d1d5db')
    .stroke();

  // Start content comfortably below the line
  doc.y = headerRuleY + 20;
  doc.fillColor('#111827');

  // ───────────────────────── LEARNER BLOCK + PHOTO ─────────────────────────
  const metaTopY = doc.y;

  // ⬇️ NARROWER learner details box (~55% of inner width)
  const metaWidth = innerWidth * 0.55;

  const photoBoxSize = 80;
  const photoX = pageWidth - rightMargin - photoBoxSize;
  const photoY = metaTopY;

  const student = card.student || {};
  const summary = card.summary || {};

  const learnerMetaRows = [
    ['Name', learnerName],
    ['Admission / ID', student.admission_code || student.id || ''],
    ['Class / Grade', student.class_label || summary.classLabel || ''],
    ['House', student.house_label || ''],
    ['Dorm / Residence', student.dorm_label || ''],
    ['Club / Activity', student.club_label || ''],
  ].filter(([, value]) => value && String(value).trim());

  const examMetaRows = [
    ['Term', card.term ? termLabel : ''],
    ['Exam', card.session?.label || ''],
  ].filter(([, value]) => value && String(value).trim());

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Learner details', leftMargin, metaTopY);
  doc.moveDown(0.25);

  doc.font('Helvetica').fontSize(9);

  let cursorY = doc.y;

  const drawRows = (rows, startX, startY) => {
    let y = startY;
    rows.forEach(([label, value]) => {
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text(label + ':', startX, y, { width: 80 });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor('#111827')
        .text(String(value), startX + 84, y, {
          width: metaWidth - 92,
        });
      y += 12;
    });
    return y;
  };

  const afterLearnerY = drawRows(learnerMetaRows, leftMargin, cursorY);
  const afterExamY = drawRows(
    examMetaRows,
    leftMargin,
    afterLearnerY + (examMetaRows.length ? 6 : 0),
  );

  const metaBlockBottom = Math.max(afterExamY, metaTopY + 50);

  // Rectangular border around learner details block (now narrower)
  doc
    .save()
    .roundedRect(
      leftMargin - 4,
      metaTopY - 6,
      metaWidth + 8,
      metaBlockBottom - metaTopY + 10,
      6,
    )
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .stroke()
    .restore();

  const photoRadius = 10;

  // Photo frame + student photo (with rounded corners)
  if (photoBuf) {
    try {
      // Clip the image to a rounded rectangle
      doc.save();
      doc
        .roundedRect(photoX, photoY, photoBoxSize, photoBoxSize, photoRadius)
        .clip();

      doc.image(photoBuf, photoX, photoY, {
        fit: [photoBoxSize, photoBoxSize],
        align: 'center',
        valign: 'center',
      });

      doc.restore();

      // Soft border around the rounded photo
      doc
        .save()
        .roundedRect(photoX, photoY, photoBoxSize, photoBoxSize, photoRadius)
        .strokeColor('#d1d5db')
        .lineWidth(0.8)
        .stroke()
        .restore();
    } catch {
      // fallback placeholder if image fails
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#9ca3af')
        .text('Photo', photoX, photoY + photoBoxSize / 2 - 4, {
          width: photoBoxSize,
          align: 'center',
        });
    }
  } else {
    // Empty rounded frame placeholder
    doc
      .save()
      .roundedRect(photoX, photoY, photoBoxSize, photoBoxSize, photoRadius)
      .strokeColor('#d1d5db')
      .lineWidth(0.8)
      .stroke()
      .restore();

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor('#9ca3af')
      .text('Photo', photoX, photoY + photoBoxSize / 2 - 4, {
        width: photoBoxSize,
        align: 'center',
      });
  }

  doc.y = metaBlockBottom + 10;
  doc.fillColor('#111827');

  // ───────────────────────── SUMMARY STRIP (KEY STATS) ─────────────────────
  const summaryItems = [];

  if (summary.totalScore != null && summary.totalMax != null) {
    summaryItems.push([
      'TOTAL SCORE',
      `${summary.totalScore}/${summary.totalMax}`,
    ]);
  }

  if (typeof summary.totalPercent === 'number') {
    summaryItems.push(['MEAN PERCENT', `${summary.totalPercent.toFixed(1)}%`]);
  }

  if (summary.meanGrade) {
    summaryItems.push(['MEAN GRADE', summary.meanGrade]);
  } else if (summary.overallGrade) {
    summaryItems.push(['OVERALL GRADE', summary.overallGrade]);
  }

  if (summary.classRank && summary.classSize) {
    summaryItems.push([
      'CLASS POSITION',
      `${ordinal(summary.classRank)} of ${summary.classSize}`,
    ]);
  }

  if (summary.overallRank && summary.overallSize) {
    summaryItems.push([
      'OVERALL POSITION',
      `${ordinal(summary.overallRank)} of ${summary.overallSize}`,
    ]);
  }

  if (summary.streamRank && summary.streamSize) {
    summaryItems.push([
      'STREAM POSITION',
      `${ordinal(summary.streamRank)} of ${summary.streamSize}`,
    ]);
  }

  if (summary.daysAbsent != null) {
    summaryItems.push(['DAYS ABSENT', String(summary.daysAbsent)]);
  }

  if (summaryItems.length) {
    doc.font('Helvetica-Bold').fontSize(9).text('Summary', leftMargin, doc.y);
    doc.moveDown(0.2);

    const boxHeight = 32;
    const cols = Math.min(4, summaryItems.length);
    const colWidth = innerWidth / cols;

    let idx = 0;
    let y = doc.y;

    while (idx < summaryItems.length) {
      for (let c = 0; c < cols && idx < summaryItems.length; c++, idx++) {
        const [label, value] = summaryItems[idx];

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
          .text(label, x + 6, y + 4, {
            width: colWidth - 16,
          });
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(String(value), x + 6, y + 14, {
            width: colWidth - 16,
          });
      }
      y += boxHeight + 4;
    }

    doc.y = y + 4;
  }

  // ───────────────────────── SUBJECT PERFORMANCE TABLE ─────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(9.5)
    .fillColor('#111827')
    .text('SUBJECT PERFORMANCE', leftMargin, doc.y);
  doc.moveDown(0.4);

  const subjects = Array.isArray(card.subjects) ? card.subjects : [];

  const tableLeft = leftMargin;
  const tableRight = pageWidth - rightMargin;
  const totalTableWidth = tableRight - tableLeft;

  const hasAnyGrade = subjects.some(
    (s) => s && s.grade && String(s.grade).trim(),
  );

  // Allow backend to force score-only mode with card.settings.showGrades = false
  const showGradeColumn =
    card.settings &&
    Object.prototype.hasOwnProperty.call(card.settings, 'showGrades')
      ? card.settings.showGrades !== false && hasAnyGrade
      : hasAnyGrade;

  // ── Column widths (narrow SCORE / % / GRADE / POSITION, wider REMARKS) ──
  const subjectColWidth = 120;
  const scoreColWidth = 55;
  const percentColWidth = 45;
  const gradeColWidth = showGradeColumn ? 40 : 0;
  const positionColWidth = 55;
  const initialsColWidth = 42;

  const remarksColWidth =
    totalTableWidth -
    (subjectColWidth +
      scoreColWidth +
      percentColWidth +
      gradeColWidth +
      positionColWidth +
      initialsColWidth);

  // X positions
  const colSubject = tableLeft;
  const colScore = colSubject + subjectColWidth;
  const colPercent = colScore + scoreColWidth;
  const colGrade = showGradeColumn ? colPercent + percentColWidth : colPercent;
  const colPosition = showGradeColumn
    ? colGrade + gradeColWidth
    : colPercent + percentColWidth;
  const colRemarks = colPosition + positionColWidth;
  const colInitials = colRemarks + remarksColWidth;

  const headerY = doc.y;

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');

  doc.text('SUBJECT', colSubject, headerY, {
    width: subjectColWidth - 4,
  });

  // Numeric headers right-aligned (as before)
  doc.text('SCORE', colScore, headerY, {
    width: scoreColWidth - 6,
    align: 'right',
  });
  doc.text('%', colPercent, headerY, {
    width: percentColWidth - 6,
    align: 'right',
  });

  if (showGradeColumn) {
    // GRADE header centered
    doc.text('GRADE', colGrade, headerY, {
      width: gradeColWidth - 4,
      align: 'center',
    });
  }

  doc.text('POSITION', colPosition, headerY, {
    width: positionColWidth - 4,
    align: 'right',
  });

  // REMARKS + INITIALS headers centered
  doc.text('REMARKS', colRemarks, headerY, {
    width: remarksColWidth - 4,
    align: 'center',
  });
  doc.text('INITIALS', colInitials, headerY, {
    width: initialsColWidth - 4,
    align: 'center',
  });

  doc.moveDown(0.2);

  const headerBottomY = doc.y;
  doc
    .moveTo(tableLeft, headerBottomY)
    .lineTo(tableRight, headerBottomY)
    .strokeColor('#9ca3af')
    .lineWidth(0.8)
    .stroke();

  doc.font('Helvetica').fontSize(8).fillColor('#111827');

  const bodyTopY = doc.y;

  // Vertically centered rows
  // Vertically centered rows
  const rowHeight = 11;
  let rowY = bodyTopY; // start rows directly under header line
  const lineHeight = doc.currentLineHeight();

  subjects.forEach((s) => {
    const subjectName = (s.subject || '—').toString().trim().toUpperCase();
    const scoreText = `${s.score ?? 0}/${s.max_score ?? 0}`;
    const pctText =
      typeof s.percent === 'number'
        ? `${Math.round(clampPercent(s.percent))}%`
        : '—';

    const gradeTextRaw = (s.grade || '').toString().trim().toUpperCase();

    // POSITION as 9/10 (no "OF")
    let posText = '—';
    if (s.classRank && s.classSize) {
      posText = `${s.classRank}/${s.classSize}`;
    }

    // STRICT: use only the MARK ENTRY remark here (no AI extras), sentence case
    const rawRemark = toSentenceCase(s.remark || '');

    let remarkShort = rawRemark;
    if (remarkShort.length > 40) {
      const clipped = remarkShort.slice(0, 40);
      const lastSpace = clipped.lastIndexOf(' ');
      remarkShort = (
        lastSpace > 14 ? clipped.slice(0, lastSpace) : clipped
      ).trimEnd();
    }

    const remarkBlock = remarkShort || '—';

    const initialsRaw = (s.teacher_initials || s.teacherInitials || '')
      .toString()
      .trim();
    const initialsText = initialsRaw ? initialsRaw.toUpperCase() : '—';

    // Row box
    const rowTopY = rowY;
    const rowBottomY = rowTopY + rowHeight;

    // Compute vertically centered y for this row
    const textY = rowTopY + (rowHeight - lineHeight) / 2;

    // SUBJECT – left-aligned with a bit of left padding
    doc.text(subjectName, colSubject + 4, textY, {
      width: subjectColWidth - 8, // keep right edge consistent
      align: 'left',
    });

    // SCORE – right-aligned
    doc.text(scoreText, colScore, textY, {
      width: scoreColWidth - 6,
      align: 'right',
    });

    // PERCENT – right-aligned
    doc.text(pctText, colPercent, textY, {
      width: percentColWidth - 6,
      align: 'right',
    });

    // GRADE – base letter and suffix aligned like class report
    if (showGradeColumn) {
      const gradeCellWidth = gradeColWidth - 4;
      const suffixWidth = 8; // slot for + / -
      const baseWidth = Math.max(0, gradeCellWidth - suffixWidth);

      if (gradeTextRaw) {
        const baseGrade = gradeTextRaw[0]; // 'A', 'B', etc.
        const suffix = gradeTextRaw.slice(1); // '+', '-', or ''

        // base letter right-aligned within its sub-cell
        doc.text(baseGrade, colGrade, textY, {
          width: baseWidth,
          align: 'right',
        });

        // suffix (if any) left-aligned in the small right sub-cell
        if (suffix) {
          doc.text(suffix, colGrade + baseWidth, textY, {
            width: suffixWidth,
            align: 'left',
          });
        }
      } else {
        // fallback dash when no grade
        doc.text('—', colGrade, textY, {
          width: gradeCellWidth,
          align: 'center',
        });
      }
    }

    // POSITION – right-aligned (e.g. 9/10)
    doc.text(posText, colPosition, textY, {
      width: positionColWidth - 4,
      align: 'right',
    });

    // REMARKS – left-aligned, sentence case, with left padding
    doc.text(remarkBlock, colRemarks + 4, textY, {
      width: remarksColWidth - 8, // shrink width to keep right edge consistent
      align: 'left',
    });

    // INITIALS – centered
    doc.text(initialsText, colInitials, textY, {
      width: initialsColWidth - 4,
      align: 'center',
    });

    // 🔲 Per-row horizontal borders (Excel-style grid)
    doc
      .strokeColor('#e5e7eb')
      .lineWidth(0.6)
      .moveTo(tableLeft, rowTopY)
      .lineTo(tableRight, rowTopY)
      .stroke();

    doc.moveTo(tableLeft, rowBottomY).lineTo(tableRight, rowBottomY).stroke();

    rowY = rowBottomY;
  });

  const tableBottomY = rowY;

  // Outer border lines
  doc
    .strokeColor('#9ca3af')
    .lineWidth(0.8)
    .moveTo(tableLeft, bodyTopY - 4)
    .lineTo(tableRight, bodyTopY - 4)
    .stroke();

  doc
    .moveTo(tableLeft, bodyTopY - 4)
    .lineTo(tableLeft, tableBottomY)
    .stroke();
  doc
    .moveTo(tableRight, bodyTopY - 4)
    .lineTo(tableRight, tableBottomY)
    .stroke();

  // Column separators
  doc
    .moveTo(colScore, bodyTopY - 4)
    .lineTo(colScore, tableBottomY)
    .stroke();
  doc
    .moveTo(colPercent, bodyTopY - 4)
    .lineTo(colPercent, tableBottomY)
    .stroke();

  if (showGradeColumn) {
    doc
      .moveTo(colGrade, bodyTopY - 4)
      .lineTo(colGrade, tableBottomY)
      .stroke();
  }

  doc
    .moveTo(colPosition, bodyTopY - 4)
    .lineTo(colPosition, tableBottomY)
    .stroke();
  doc
    .moveTo(colRemarks, bodyTopY - 4)
    .lineTo(colRemarks, tableBottomY)
    .stroke();
  doc
    .moveTo(colInitials, bodyTopY - 4)
    .lineTo(colInitials, tableBottomY)
    .stroke();

  doc.y = tableBottomY + 8;

  // ───────────────────── AI-ASSISTED EXTRA COLUMNS (OPTIONAL) ─────────────────────
  const aiMatrix = buildAiExtrasMatrix(subjects);

  if (aiMatrix) {
    const { extraKeys, rows } = aiMatrix;

    // Rough height estimate so we don't crush signatures / footer
    const estimatedTableHeight = 24 + (rows.length + 1) * 11;
    if (doc.y + estimatedTableHeight < pageHeight - 120) {
      // Subtitle
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor('#111827')
        .text('Extra Details', leftMargin, doc.y);
      doc.moveDown(0.2);

      const boxX = leftMargin;
      const tableStartY = doc.y;
      const subjectColWidth = 120;
      const extrasCount = extraKeys.length || 1;
      const extraColWidth = (innerWidth - subjectColWidth) / extrasCount;

      // Header row
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#374151');

      doc.text('SUBJECT', boxX + 4, doc.y, {
        width: subjectColWidth - 8,
      });

      extraKeys.forEach((key, idx) => {
        const colX = boxX + subjectColWidth + idx * extraColWidth;
        doc.text(String(key), colX + 2, doc.y, {
          width: extraColWidth - 4,
        });
      });

      doc.moveDown(0.1);
      const headerBottomY2 = doc.y;

      // Light horizontal line under header
      doc
        .moveTo(boxX, headerBottomY2)
        .lineTo(boxX + innerWidth, headerBottomY2)
        .strokeColor('#cbd5f5')
        .lineWidth(0.5)
        .stroke();

      // Rows
      doc.font('Helvetica').fontSize(7).fillColor('#111827');

      rows.forEach((row) => {
        const y = doc.y;
        doc.text(String(row.subject).toUpperCase(), boxX + 4, y, {
          width: subjectColWidth - 8,
        });

        row.cells.forEach((cell, idx) => {
          const colX = boxX + subjectColWidth + idx * extraColWidth;
          doc.text(String(cell), colX + 2, y, {
            width: extraColWidth - 4,
          });
        });

        doc.moveDown(0.1);
      });

      const tableBottomY2 = doc.y + 2;

      // Dashed rounded border around whole AI table
      doc.save();
      doc
        .dash(2, { space: 2 })
        .roundedRect(
          boxX - 2,
          tableStartY - 4,
          innerWidth + 4,
          tableBottomY2 - tableStartY + 6,
          4,
        )
        .strokeColor('#cbd5f5')
        .lineWidth(0.6)
        .stroke();
      doc.undash();
      doc.restore();

      doc.y = tableBottomY2 + 4;
    }
  }

  // ───────────────────────── MINI PROGRESS SPARKLINE (OPTIONAL) ────────────
  let series = (card.progressSeries || []).filter(
    (p) => p && typeof p.percent === 'number',
  );

  // Ensure the *current* term (isCurrent) is drawn as the right–most point
  if (series.length >= 2) {
    const currentIdx = series.findIndex((p) => p.isCurrent);
    if (currentIdx >= 0 && currentIdx !== series.length - 1) {
      const [currentPoint] = series.splice(currentIdx, 1);
      series.push(currentPoint);
    }
  }

  if (series.length >= 2 && doc.y < pageHeight * 0.65) {
    // 👉 extra breathing room after SUBJECT PERFORMANCE / AI extras
    doc.moveDown(0.6);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('Progress trend', leftMargin, doc.y);

    doc.moveDown(0.1);

    const chartHeight = 40;
    const chartWidth = innerWidth * 0.55;
    const chartLeft = leftMargin + 20;
    const chartTop = doc.y + 4;
    const chartBottom = chartTop + chartHeight;

    // Axis
    doc
      .strokeColor('#9ca3af')
      .lineWidth(1.1)
      .moveTo(chartLeft, chartBottom)
      .lineTo(chartLeft + chartWidth, chartBottom)
      .stroke();
    doc.moveTo(chartLeft, chartTop).lineTo(chartLeft, chartBottom).stroke();

    const stepX = chartWidth / Math.max(1, series.length - 1);
    const barMaxHeight = chartHeight - 10;

    // line path
    doc.strokeColor('#3b82f6').lineWidth(1.4);
    series.forEach((p, idx) => {
      const x = chartLeft + idx * stepX;
      const pct = clampPercent(p.percent);
      const y = chartBottom - (pct / 100) * barMaxHeight;

      if (idx === 0) {
        doc.moveTo(x, y);
      } else {
        doc.lineTo(x, y);
      }
    });
    doc.stroke();

    // dots
    series.forEach((p, idx) => {
      const x = chartLeft + idx * stepX;
      const pct = clampPercent(p.percent);
      const y = chartBottom - (pct / 100) * barMaxHeight;

      const isCurrent = !!p.isCurrent;
      doc
        .save()
        .circle(x, y, isCurrent ? 3 : 2)
        .fill(isCurrent ? '#3b82f6' : '#9ca3af')
        .restore();
    });

    // labels under axis – full labels
    doc.font('Helvetica').fontSize(6).fillColor('#6b7280');
    series.forEach((p, idx) => {
      const x = chartLeft + idx * stepX;
      const label = (p.label || '').toString();
      doc.text(label, x - 22, chartBottom + 2, {
        width: 44,
        align: 'center',
      });
    });

    doc.y = chartBottom + 20;
  }

  // ───────────────────────── ATTENDANCE & BEHAVIOUR ────────────────────────
  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#111827')
    .text('Attendance & behaviour', leftMargin, doc.y);
  doc.moveDown(0.15);

  const a = card.attendance;

  if (a) {
    doc.font('Helvetica').fontSize(8).fillColor('#111827');

    const lines = [];

    if (a.lessonsAttended != null && a.lessonsHeld != null) {
      lines.push(`Lessons attended: ${a.lessonsAttended} of ${a.lessonsHeld}`);
    }
    if (typeof a.attendancePercent === 'number') {
      lines.push(`Attendance: ${a.attendancePercent.toFixed(1)}%`);
    }
    if (a.behaviorRating != null) {
      lines.push(`Behaviour: ${a.behaviorRating} / 5`);
    }
    if (a.punctualityRating != null) {
      lines.push(`Punctuality: ${a.punctualityRating} / 5`);
    }

    if (lines.length) {
      lines.forEach((line) => doc.text(line, { width: innerWidth }));
    } else {
      doc.text('Attendance details have not been recorded for this term.');
    }

    if (a.teacherComment) {
      doc.moveDown(0.15);
      doc
        .font('Helvetica')
        .fontSize(8)
        .text(`Class teacher’s remarks: ${a.teacherComment}`, {
          width: innerWidth,
        });
    }
  } else {
    doc
      .font('Helvetica')
      .fontSize(8)
      .text('Attendance data not recorded for this term.', {
        width: innerWidth,
      });
  }

  doc.moveDown(0.4);

  // ───────────────────────── GENERAL REMARKS (PRINCIPAL SECTION) ────────────
  const overallRemark = summary.overallRemark;
  const principalRemark = summary.principalRemark;

  doc
    .font('Helvetica-Bold')
    .fontSize(9)
    .fillColor('#111827')
    .text('Remarks', leftMargin, doc.y);
  doc.moveDown(0.15);

  // (a) Overall remark from grading bands / system
  if (overallRemark) {
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6b7280')
      .text('Overall remark:', { width: innerWidth });
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#111827')
      .text(String(overallRemark), { width: innerWidth });
    doc.moveDown(0.2);
  }

  // (b) Principal’s dedicated remarks area – ALWAYS shown
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#6b7280')
    .text("Principal's remarks:", { width: innerWidth });
  doc.moveDown(0.1);

  if (principalRemark) {
    // If stored from backend, print it
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#111827')
      .text(String(principalRemark), { width: innerWidth });
    doc.moveDown(0.3);
  } else {
    // Otherwise, provide 3 tidy lines for handwritten comments
    const lineWidth = innerWidth;
    let y = doc.y + 2;
    const lineSpacing = 12;

    for (let i = 0; i < 3; i++) {
      doc
        .strokeColor('#d1d5db')
        .lineWidth(0.9)
        .moveTo(leftMargin, y)
        .lineTo(leftMargin + lineWidth, y)
        .stroke();
      y += lineSpacing;
    }

    doc.y = y + 2;
  }
  // ───────────────────────── SIGNATURES ───────────────────────────────
  doc.moveDown(0.6);

  // Push signatures block towards the bottom
  const signatureBlockHeight = 90; // slightly smaller, we control vertical layout ourselves
  const sigBlockTop = Math.max(doc.y, pageHeight - signatureBlockHeight - 80);

  // Subtle separator line above signatures (to separate from Remarks)
  const separatorY = sigBlockTop - 6;
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.7)
    .moveTo(leftMargin, separatorY)
    .lineTo(pageWidth - rightMargin, separatorY)
    .stroke();

  // Columns: left = teacher, right = principal
  const sigColumnWidth = innerWidth * 0.38; // ~38% each side → nice central gap
  const teacherLabelX = leftMargin;
  const principalLabelX = pageWidth - rightMargin - sigColumnWidth;

  // Vertical layout: label → small gap → signature image → line
  const labelY = sigBlockTop + 4;
  const sigImageMaxHeight = 45; // moderate height so it sits close to the label
  const labelToSigGap = 10;

  // ── Class teacher / Instructor (LEFT) ──
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text('Class teacher / Instructor', teacherLabelX, labelY, {
      width: sigColumnWidth,
      align: 'left',
    });

  const teacherSigTopY = labelY + labelToSigGap;
  let teacherSigBottomY = teacherSigTopY;

  if (teacherSigBuf) {
    try {
      const sigWidth = Math.min(sigColumnWidth - 20, 220);
      const sigX = teacherLabelX + (sigColumnWidth - sigWidth) / 2; // center in column
      const sigY = teacherSigTopY;

      doc.image(teacherSigBuf, sigX, sigY, {
        fit: [sigWidth, sigImageMaxHeight],
      });

      teacherSigBottomY = sigY + sigImageMaxHeight;
    } catch {
      // ignore image failures
      teacherSigBottomY = teacherSigTopY + sigImageMaxHeight;
    }
  } else {
    teacherSigBottomY = teacherSigTopY + sigImageMaxHeight;
  }

  // ── Head teacher / Principal (RIGHT) ──
  const principalLabel = 'Head teacher / Principal';

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text(principalLabel, principalLabelX, labelY, {
      width: sigColumnWidth,
      align: 'right', // text hugs the right edge of the content
    });

  const principalSigTopY = labelY + labelToSigGap;
  let principalSigBottomY = principalSigTopY;

  if (registrarSigBuf) {
    try {
      const sigWidth = Math.min(sigColumnWidth - 20, 220);

      // 📍 Find the horizontal center of the *text* (which is right-aligned)
      const labelWidth = doc.widthOfString(principalLabel);
      const labelRight = principalLabelX + sigColumnWidth; // right edge of text box
      const labelCenterX = labelRight - labelWidth / 2;

      // Center the signature exactly under that text
      const sigX = labelCenterX - sigWidth / 2;
      const sigY = principalSigTopY;

      doc.image(registrarSigBuf, sigX, sigY, {
        fit: [sigWidth, sigImageMaxHeight],
      });

      principalSigBottomY = sigY + sigImageMaxHeight;
    } catch {
      principalSigBottomY = principalSigTopY + sigImageMaxHeight;
    }
  } else {
    principalSigBottomY = principalSigTopY + sigImageMaxHeight;
  }

  // Line goes just under the lowest of the two signatures
  const sigLineY = Math.max(teacherSigBottomY, principalSigBottomY) + 4;

  // Signature line under left column
  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(teacherLabelX, sigLineY)
    .lineTo(teacherLabelX + sigColumnWidth, sigLineY)
    .stroke();

  // Signature line under right column
  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(principalLabelX, sigLineY)
    .lineTo(principalLabelX + sigColumnWidth, sigLineY)
    .stroke();

  // ───────────────────────── FOOTER: REPORT CARD NUMBER ─────────────────────────
  drawFooterReportNumber(doc, reportNumber, {
    y: pageHeight - 40, // safely above bottom margin
    size: 9,
    opacity: 0.45,
  });

  doc.end();
  return bufferPromise;
}

/**
 * Class report (one-page/multi-page) for a single class & exam session.
 */
export async function renderOrgExamClassReportPdf(payload) {
  const {
    org = {},
    examMeta = {},
    subjectStats = [],
    studentRows = [],
    format = 'booklet',
  } = payload || {};

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const pageWidth = Number(doc.page.width) || 595.28;
  const pageHeight = Number(doc.page.height) || 841.89;
  const leftMargin = Number(doc.page.margins?.left) || 40;
  const rightMargin = Number(doc.page.margins?.right) || 40;
  const innerWidth = pageWidth - leftMargin - rightMargin;
  const bottomMarginY = pageHeight - 60;

  const schoolName = org.name || 'School class report';
  const classLabel = examMeta.classLabel || '';
  const termLabel = examMeta.termLabel || '';
  const termYear = examMeta.termYear || '';
  const examLabel = examMeta.examLabel || '';

  const headerLineBits = [
    classLabel && `Class: ${classLabel}`,
    termYear && termLabel && `Term: ${termYear} ${termLabel}`,
    examLabel && `Exam: ${examLabel}`,
  ].filter(Boolean);

  // Basic numeric helpers for stats
  const asNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const cleanStudents = studentRows
    .map((s) => ({
      ...s,
      total_score: asNum(s.total_score),
      total_max: asNum(s.total_max),
      total_percent: asNum(s.total_percent),
      position: s.position || null,
    }))
    .filter((s) => s.total_score != null || s.total_percent != null);

  const classSize = cleanStudents.length;
  const percentValues = cleanStudents
    .map((s) => asNum(s.total_percent))
    .filter((v) => v != null);
  const meanPercent =
    percentValues.length > 0
      ? percentValues.reduce((a, b) => a + b, 0) / percentValues.length
      : null;
  const bestPercent =
    percentValues.length > 0 ? Math.max(...percentValues) : null;
  const worstPercent =
    percentValues.length > 0 ? Math.min(...percentValues) : null;

  // Sort by percent desc and assign positions if missing
  cleanStudents.sort((a, b) => {
    const pa = a.total_percent ?? -Infinity;
    const pb = b.total_percent ?? -Infinity;
    if (pb !== pa) return pb - pa;
    const na = (a.student_name || '').toString();
    const nb = (b.student_name || '').toString();
    return na.localeCompare(nb);
  });

  let currentPos = 1;
  const rankedStudents = cleanStudents.map((s) => ({
    ...s,
    position: s.position || currentPos++,
  }));

  // Deterministic "class report" number using existing helper
  const termString =
    termYear && termLabel ? `${termYear} ${termLabel}` : termLabel || '';
  const reportNumber = generateReportCardNumber({
    brandName: schoolName,
    studentName: classLabel || 'CLASS',
    classLabel: classLabel || '',
    termLabel: termString,
    examLabel,
  });

  // Preload logo + signatures (principal + class teacher)
  const teacherSignatureSource =
    examMeta.class_teacher_signature_url || // 👈 per-class (same as learner card)
    examMeta.teacher_signature_url || // optional per-exam override
    org.instructor_signature_url || // org-level instructor sig
    org.teacher_signature_url || // legacy/fallback
    null;

  const registrarSignatureSource =
    org.signature_url ||
    org.registrar_signature_url ||
    org.principal_signature_url;

  const [logoBuf, registrarSigBuf, teacherSigBuf] = await Promise.all([
    tryLoadImageBuffer(org.logo_url, {
      w: 240,
      h: 240,
      trim: false,
      exact: false,
      dpr: 2,
    }),
    tryLoadImageBuffer(registrarSignatureSource, {
      w: 520,
      h: 200,
      trim: true,
      exact: false,
      dpr: 2,
    }),
    tryLoadImageBuffer(teacherSignatureSource, {
      w: 520,
      h: 200,
      trim: true,
      exact: false,
      dpr: 2,
    }),
  ]);

  /* ───────────────────────── HEADER HELPERS ───────────────────────── */

  const headerHeight = 70;

  const drawPageHeader = () => {
    doc.save().rect(0, 0, pageWidth, headerHeight).fill('#f3f4f6').restore();

    if (logoBuf) {
      try {
        doc.image(logoBuf, leftMargin, 14, {
          fit: [48, 48],
          align: 'left',
          valign: 'top',
        });
      } catch {
        // ignore
      }
    }

    // School name
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(schoolName, leftMargin + (logoBuf ? 60 : 0), 18, {
        width: innerWidth - (logoBuf ? 60 : 0),
        align: 'center',
      });

    // Optional contact lines
    const contactBits = [org.address_line1, org.address_line2].filter(
      (x) => x && String(x).trim(),
    );

    const contactInlineBits = [
      org.phone_number && `Tel: ${org.phone_number}`,
      org.contact_email && `Email: ${org.contact_email}`,
      org.website_url && `Website: ${org.website_url}`,
    ].filter(Boolean);

    const contactTextLines = [
      ...contactBits,
      contactInlineBits.length ? contactInlineBits.join('   •   ') : null,
    ].filter(Boolean);

    let lastContactBottomY = 32; // baseline in case there are no contacts

    if (contactTextLines.length) {
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      contactTextLines.forEach((line, idx) => {
        const lineY = 40 + idx * 10;
        doc.text(line, leftMargin + (logoBuf ? 60 : 0), lineY, {
          width: innerWidth - (logoBuf ? 60 : 0),
          align: 'center',
        });
        lastContactBottomY = lineY + 10;
      });
    }

    // Ensure similar spacing between contact block and title
    const minTitleY = headerHeight - 8;
    const titleY = Math.max(minTitleY, lastContactBottomY + 6);

    // Report title
    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('CLASS PERFORMANCE REPORT', leftMargin, titleY, {
        width: innerWidth,
        align: 'center',
      });

    // Class / term / exam line(s) directly under title
    let headerRuleY = titleY + 16;

    if (headerLineBits.length) {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#374151')
        .text(headerLineBits.join('   •   '), leftMargin, titleY + 18, {
          width: innerWidth,
          align: 'center',
        });

      // place rule just below that meta line
      headerRuleY = doc.y + 6;
    }

    doc
      .moveTo(leftMargin, headerRuleY)
      .lineTo(pageWidth - rightMargin, headerRuleY)
      .strokeColor('#d1d5db')
      .lineWidth(0.8)
      .stroke();

    doc.y = headerRuleY + 8;
    doc.fillColor('#111827');
  };

  const ensureSpace = (minHeight = 40) => {
    if (doc.y + minHeight <= bottomMarginY) return;
    doc.addPage();
    drawPageHeader();
  };

  // initial page header
  drawPageHeader();

  /* ───────────────────────── SUMMARY TILES ───────────────────────── */

  const summaryItems = [];

  summaryItems.push(['CANDIDATES', classSize || 0]);

  if (meanPercent != null) {
    summaryItems.push(['MEAN PERCENT', `${meanPercent.toFixed(1)}%`]);
  }

  if (bestPercent != null) {
    summaryItems.push(['BEST PERCENT', `${bestPercent.toFixed(1)}%`]);
  }

  if (worstPercent != null) {
    summaryItems.push(['LOWEST PERCENT', `${worstPercent.toFixed(1)}%`]);
  }

  if (summaryItems.length) {
    ensureSpace(60);
    doc.font('Helvetica-Bold').fontSize(9).text('Summary', leftMargin, doc.y);
    doc.moveDown(0.2);

    const boxHeight = 32;
    const cols = Math.min(4, summaryItems.length);
    const colWidth = innerWidth / cols;
    let idx = 0;
    let y = doc.y;

    while (idx < summaryItems.length) {
      ensureSpace(boxHeight + 8);
      for (let c = 0; c < cols && idx < summaryItems.length; c++, idx++) {
        const [label, value] = summaryItems[idx];
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
          .text(label, x + 6, y + 4, {
            width: colWidth - 16,
          });

        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#111827')
          .text(String(value), x + 6, y + 14, {
            width: colWidth - 16,
          });
      }
      y += boxHeight + 4;
    }

    doc.y = y + 4;
  }

  /* ───────────────────────── SUBJECT SUMMARY (MULTI-PAGE) ───────────────────────── */

  const safeSubjectStats = (
    Array.isArray(subjectStats) ? subjectStats : []
  ).map((s) => ({
    subject: s.subject || '—',
    scripts: asNum(s.scripts) ?? s.scripts ?? '',
    avg_percent: asNum(s.avg_percent),
    min_percent: asNum(s.min_percent),
    max_percent: asNum(s.max_percent),
  }));

  const drawSubjectSummaryHeader = (continued = false) => {
    ensureSpace(40);
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#111827')
      .text(
        continued ? 'SUBJECT SUMMARY (cont.)' : 'SUBJECT SUMMARY',
        leftMargin,
        doc.y,
      );
    doc.moveDown(0.3);

    const tableLeft = leftMargin;
    const tableRight = pageWidth - rightMargin;

    const colSubject = tableLeft;
    const colScripts = colSubject + 170;
    const colAvg = colScripts + 60;
    const colMin = colAvg + 55;
    const colMax = colMin + 55;

    const rowHeight = 12;
    const headerTopY = doc.y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
    const headerLineHeight = doc.currentLineHeight();
    const headerTextY = headerTopY + (rowHeight - headerLineHeight) / 2;

    // header text centered vertically within header row
    doc.text('SUBJECT', colSubject, headerTextY, {
      width: colScripts - colSubject - 4,
    });
    doc.text('SCRIPTS', colScripts, headerTextY, {
      width: colAvg - colScripts - 4,
      align: 'right',
    });
    doc.text('AVG %', colAvg, headerTextY, {
      width: colMin - colAvg - 4,
      align: 'right',
    });
    doc.text('MIN %', colMin, headerTextY, {
      width: colMax - colMin - 4,
      align: 'right',
    });
    doc.text('MAX %', colMax, headerTextY, {
      width: tableRight - colMax - 4,
      align: 'right',
    });

    const headerBottomY = headerTopY + rowHeight;

    // Excel-style full borders for header row
    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.7)
      // top + bottom
      .moveTo(tableLeft, headerTopY)
      .lineTo(tableRight, headerTopY)
      .stroke();
    doc
      .moveTo(tableLeft, headerBottomY)
      .lineTo(tableRight, headerBottomY)
      .stroke();
    // verticals (include outer edges)
    doc.moveTo(tableLeft, headerTopY).lineTo(tableLeft, headerBottomY).stroke();
    doc
      .moveTo(colScripts, headerTopY)
      .lineTo(colScripts, headerBottomY)
      .stroke();
    doc.moveTo(colAvg, headerTopY).lineTo(colAvg, headerBottomY).stroke();
    doc.moveTo(colMin, headerTopY).lineTo(colMin, headerBottomY).stroke();
    doc.moveTo(colMax, headerTopY).lineTo(colMax, headerBottomY).stroke();
    doc
      .moveTo(tableRight, headerTopY)
      .lineTo(tableRight, headerBottomY)
      .stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    doc.y = headerBottomY;

    return {
      tableLeft,
      tableRight,
      colSubject,
      colScripts,
      colAvg,
      colMin,
      colMax,
      rowHeight,
    };
  };

  if (safeSubjectStats.length) {
    let subjectTableLayout = drawSubjectSummaryHeader(false);

    for (let i = 0; i < safeSubjectStats.length; i++) {
      const {
        tableLeft,
        tableRight,
        colSubject,
        colScripts,
        colAvg,
        colMin,
        colMax,
        rowHeight,
      } = subjectTableLayout;

      // page break safety for next row
      if (doc.y + rowHeight > bottomMarginY) {
        doc.addPage();
        drawPageHeader();
        subjectTableLayout = drawSubjectSummaryHeader(true);
        continue;
      }

      const s = safeSubjectStats[i];

      const rowTopY = doc.y;
      const lineHeight = doc.currentLineHeight();
      const textY = rowTopY + (rowHeight - lineHeight) / 2;

      const avgTxt =
        s.avg_percent != null ? `${s.avg_percent.toFixed(1)}%` : '—';
      const minTxt =
        s.min_percent != null ? `${s.min_percent.toFixed(1)}%` : '—';
      const maxTxt =
        s.max_percent != null ? `${s.max_percent.toFixed(1)}%` : '—';

      // row text (centered vertically)
      doc.text(String(s.subject).toUpperCase(), colSubject, textY, {
        width: colScripts - colSubject - 4,
      });
      doc.text(String(s.scripts ?? '—'), colScripts, textY, {
        width: colAvg - colScripts - 4,
        align: 'right',
      });
      doc.text(avgTxt, colAvg, textY, {
        width: colMin - colAvg - 4,
        align: 'right',
      });
      doc.text(minTxt, colMin, textY, {
        width: colMax - colMin - 4,
        align: 'right',
      });
      doc.text(maxTxt, colMax, textY, {
        width: tableRight - colMax - 4,
        align: 'right',
      });

      const rowBottomY = rowTopY + rowHeight;

      // Excel-style borders for this data row
      doc
        .strokeColor('#9ca3af')
        .lineWidth(0.5)
        // top + bottom
        .moveTo(tableLeft, rowTopY)
        .lineTo(tableRight, rowTopY)
        .stroke();
      doc.moveTo(tableLeft, rowBottomY).lineTo(tableRight, rowBottomY).stroke();
      // verticals (outer + internal)
      doc.moveTo(tableLeft, rowTopY).lineTo(tableLeft, rowBottomY).stroke();
      doc.moveTo(colScripts, rowTopY).lineTo(colScripts, rowBottomY).stroke();
      doc.moveTo(colAvg, rowTopY).lineTo(colAvg, rowBottomY).stroke();
      doc.moveTo(colMin, rowTopY).lineTo(colMin, rowBottomY).stroke();
      doc.moveTo(colMax, rowTopY).lineTo(colMax, rowBottomY).stroke();
      doc.moveTo(tableRight, rowTopY).lineTo(tableRight, rowBottomY).stroke();

      doc.y = rowBottomY;
    }

    doc.y += 6;
  }

  /* ───────────────────────── TOP LEARNERS / RANK LIST (MULTI-PAGE) ───────────────────────── */

  const learners = rankedStudents;

  const drawTopLearnersHeader = (continued = false) => {
    ensureSpace(40);
    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor('#111827')
      .text(
        continued ? 'TOP LEARNERS (cont.)' : 'TOP LEARNERS',
        leftMargin,
        doc.y,
      );
    doc.moveDown(0.3);

    const tableLeft = leftMargin;
    const tableRight = pageWidth - rightMargin;

    const colPos = tableLeft;
    const colAdmName = colPos + 40;
    const colTotal = colAdmName + 210;
    const colPercent = colTotal + 70;
    const colGrade = colPercent + 60;

    const rowHeight = 12;
    const headerTopY = doc.y;

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#374151');
    const headerLineHeight = doc.currentLineHeight();
    const headerTextY = headerTopY + (rowHeight - headerLineHeight) / 2;

    doc.text('POS', colPos, headerTextY, {
      width: colAdmName - colPos - 4,
    });
    doc.text('ADM / NAME', colAdmName, headerTextY, {
      width: colTotal - colAdmName - 4,
    });
    doc.text('TOTAL', colTotal, headerTextY, {
      width: colPercent - colTotal - 4,
      align: 'right',
    });
    doc.text('%', colPercent, headerTextY, {
      width: colGrade - colPercent - 4,
      align: 'right',
    });
    doc.text('GRADE', colGrade, headerTextY, {
      width: tableRight - colGrade - 4,
      align: 'right', // ✅ header right-aligned
    });

    const headerBottomY = headerTopY + rowHeight;

    // borders (unchanged)
    doc
      .strokeColor('#9ca3af')
      .lineWidth(0.7)
      .moveTo(tableLeft, headerTopY)
      .lineTo(tableRight, headerTopY)
      .stroke();
    doc
      .moveTo(tableLeft, headerBottomY)
      .lineTo(tableRight, headerBottomY)
      .stroke();
    doc.moveTo(tableLeft, headerTopY).lineTo(tableLeft, headerBottomY).stroke();
    doc
      .moveTo(colAdmName, headerTopY)
      .lineTo(colAdmName, headerBottomY)
      .stroke();
    doc.moveTo(colTotal, headerTopY).lineTo(colTotal, headerBottomY).stroke();
    doc
      .moveTo(colPercent, headerTopY)
      .lineTo(colPercent, headerBottomY)
      .stroke();
    doc.moveTo(colGrade, headerTopY).lineTo(colGrade, headerBottomY).stroke();
    doc
      .moveTo(tableRight, headerTopY)
      .lineTo(tableRight, headerBottomY)
      .stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#111827');
    doc.y = headerBottomY;

    return {
      tableLeft,
      tableRight,
      colPos,
      colAdmName,
      colTotal,
      colPercent,
      colGrade,
      rowHeight,
    };
  };

  if (learners.length) {
    let learnersTableLayout = drawTopLearnersHeader(false);

    for (let i = 0; i < learners.length; i++) {
      const {
        tableLeft,
        tableRight,
        colPos,
        colAdmName,
        colTotal,
        colPercent,
        colGrade,
        rowHeight,
      } = learnersTableLayout;

      // page break safety
      if (doc.y + rowHeight > bottomMarginY) {
        doc.addPage();
        drawPageHeader();
        learnersTableLayout = drawTopLearnersHeader(true);
        continue;
      }

      const s = learners[i];

      const rowTopY = doc.y;
      const lineHeight = doc.currentLineHeight();
      const textY = rowTopY + (rowHeight - lineHeight) / 2;

      const pos = s.position || 0;
      const posText = pos ? ordinal(pos).toUpperCase() : '—';

      const nameLine = [
        s.admission_code && String(s.admission_code).trim(),
        s.student_name && String(s.student_name).trim(),
      ]
        .filter(Boolean)
        .join(' – ');

      const totalText =
        s.total_score != null && s.total_max != null
          ? `${s.total_score}/${s.total_max}`
          : s.total_score != null
            ? String(s.total_score)
            : '—';

      const pctText =
        s.total_percent != null
          ? `${clampPercent(s.total_percent).toFixed(1)}%`
          : '—';

      const gradeTextRaw = (s.overall_grade || '')
        .toString()
        .toUpperCase()
        .trim();

      // row text, vertically centered
      doc.text(posText, colPos, textY, {
        width: colAdmName - colPos - 4,
      });
      doc.text(nameLine || 'Learner', colAdmName, textY, {
        width: colTotal - colAdmName - 4,
      });
      doc.text(totalText, colTotal, textY, {
        width: colPercent - colTotal - 4,
        align: 'right',
      });
      doc.text(pctText, colPercent, textY, {
        width: colGrade - colPercent - 4,
        align: 'right',
      });

      // ── GRADE: align base letter and suffix separately ──
      const gradeCellWidth = tableRight - colGrade - 4;
      const suffixWidth = 8; // small fixed slot on the right
      const baseWidth = Math.max(0, gradeCellWidth - suffixWidth);

      if (gradeTextRaw) {
        const baseGrade = gradeTextRaw[0]; // 'A', 'B', 'C'
        const suffix = gradeTextRaw.slice(1); // '+', '-', or ''

        // base letter right-aligned within its sub-cell
        doc.text(baseGrade, colGrade, textY, {
          width: baseWidth,
          align: 'right',
        });

        // suffix (if any) left-aligned in the tiny right sub-cell
        if (suffix) {
          doc.text(suffix, colGrade + baseWidth, textY, {
            width: suffixWidth,
            align: 'left',
          });
        }
      } else {
        // fallback when there is no grade
        doc.text('—', colGrade, textY, {
          width: gradeCellWidth,
          align: 'right',
        });
      }

      const rowBottomY = rowTopY + rowHeight;

      // Excel-style borders for this row
      doc
        .strokeColor('#9ca3af')
        .lineWidth(0.5)
        // top + bottom
        .moveTo(tableLeft, rowTopY)
        .lineTo(tableRight, rowTopY)
        .stroke();
      doc.moveTo(tableLeft, rowBottomY).lineTo(tableRight, rowBottomY).stroke();
      // verticals
      doc.moveTo(tableLeft, rowTopY).lineTo(tableLeft, rowBottomY).stroke();
      doc.moveTo(colAdmName, rowTopY).lineTo(colAdmName, rowBottomY).stroke();
      doc.moveTo(colTotal, rowTopY).lineTo(colTotal, rowBottomY).stroke();
      doc.moveTo(colPercent, rowTopY).lineTo(colPercent, rowBottomY).stroke();
      doc.moveTo(colGrade, rowTopY).lineTo(colGrade, rowBottomY).stroke();
      doc.moveTo(tableRight, rowTopY).lineTo(tableRight, rowBottomY).stroke();

      doc.y = rowBottomY;
    }

    ensureSpace(20);
    if (classSize > learners.length) {
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#6b7280')
        .text(
          `Showing ${learners.length} of ${classSize} learners in ${classLabel}.`,
          leftMargin,
          doc.y,
          { width: innerWidth },
        );
    }
  }

  /* ───────────────────────── SIGNATURES + FOOTER NO. ───────────────────────── */

  // Make sure we have enough space; otherwise new page
  ensureSpace(120);
  doc.moveDown(0.6);

  const signatureBlockHeight = 90;
  const sigBlockTop = Math.max(doc.y, pageHeight - signatureBlockHeight - 80);

  // Separator line above signatures
  const separatorY = sigBlockTop - 6;
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.7)
    .moveTo(leftMargin, separatorY)
    .lineTo(pageWidth - rightMargin, separatorY)
    .stroke();

  // Columns: left = teacher, right = principal
  const sigColumnWidth = innerWidth * 0.38; // ~38% each side
  const teacherLabelX = leftMargin;
  const principalLabelX = pageWidth - rightMargin - sigColumnWidth;

  // Vertical layout
  const labelY = sigBlockTop + 4;
  const sigImageMaxHeight = 45;
  const labelToSigGap = 10;

  // ── Class teacher / Instructor (LEFT) ──
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text('Class teacher / Instructor', teacherLabelX, labelY, {
      width: sigColumnWidth,
      align: 'left',
    });

  const teacherSigTopY = labelY + labelToSigGap;
  let teacherSigBottomY = teacherSigTopY;

  if (teacherSigBuf) {
    try {
      const sigWidth = Math.min(sigColumnWidth - 20, 220);
      const sigX = teacherLabelX + (sigColumnWidth - sigWidth) / 2; // center in column
      const sigY = teacherSigTopY;

      doc.image(teacherSigBuf, sigX, sigY, {
        fit: [sigWidth, sigImageMaxHeight],
      });

      teacherSigBottomY = sigY + sigImageMaxHeight;
    } catch {
      teacherSigBottomY = teacherSigTopY + sigImageMaxHeight;
    }
  } else {
    teacherSigBottomY = teacherSigTopY + sigImageMaxHeight;
  }

  // ── Head teacher / Principal (RIGHT) ──
  const principalLabel = 'Head teacher / Principal';

  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#111827')
    .text(principalLabel, principalLabelX, labelY, {
      width: sigColumnWidth,
      align: 'right',
    });

  const principalSigTopY = labelY + labelToSigGap;
  let principalSigBottomY = principalSigTopY;

  if (registrarSigBuf) {
    try {
      const sigWidth = Math.min(sigColumnWidth - 20, 220);

      // center signature under right-aligned label
      const labelWidth = doc.widthOfString(principalLabel);
      const labelRight = principalLabelX + sigColumnWidth;
      const labelCenterX = labelRight - labelWidth / 2;

      const sigX = labelCenterX - sigWidth / 2;
      const sigY = principalSigTopY;

      doc.image(registrarSigBuf, sigX, sigY, {
        fit: [sigWidth, sigImageMaxHeight],
      });

      principalSigBottomY = sigY + sigImageMaxHeight;
    } catch {
      principalSigBottomY = principalSigTopY + sigImageMaxHeight;
    }
  } else {
    principalSigBottomY = principalSigTopY + sigImageMaxHeight;
  }

  const sigLineY = Math.max(teacherSigBottomY, principalSigBottomY) + 4;

  // Signature line under left column
  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(teacherLabelX, sigLineY)
    .lineTo(teacherLabelX + sigColumnWidth, sigLineY)
    .stroke();

  // Signature line under right column
  doc
    .strokeColor('#d1d5db')
    .lineWidth(0.9)
    .moveTo(principalLabelX, sigLineY)
    .lineTo(principalLabelX + sigColumnWidth, sigLineY)
    .stroke();

  // Footer: Class report number
  drawFooterReportNumber(doc, reportNumber, {
    y: pageHeight - 40,
    size: 9,
    opacity: 0.45,
  });

  doc.end();
  return bufferPromise;
}
