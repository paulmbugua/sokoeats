import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';
import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_NAME || '';

const oneline = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

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
  console.warn('[orgAiSubmissionsPdf] fetchBufferWithSignedRetry failed', {
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

  if (typeof idOrUrl === 'string' && idOrUrl.includes('://')) {
    try {
      const buf = await fetchBufferWithSignedRetry(idOrUrl, {
        responseType: 'arraybuffer',
        timeout: 6000,
      });
      if (buf) return buf;
    } catch (e) {
      console.warn('[orgAiSubmissionsPdf] direct image fetch failed', e?.message);
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
    console.warn('[orgAiSubmissionsPdf] Cloudinary fetch failed:', {
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
  drawPageHeader();
}

function fmtDate(dtLike) {
  if (!dtLike) return '';
  const d = new Date(dtLike);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function sanitizeScore(score) {
  if (score == null || Number.isNaN(Number(score))) return '—';
  return `${Math.round(Number(score))}%`;
}

function drawTableHeader(doc, { left, right, top, columns }) {
  const height = 20;
  doc
    .save()
    .rect(left, top, right - left, height)
    .fill('#f8fafc')
    .restore();

  doc.font('Helvetica-Bold').fontSize(9).fillColor('#111827');
  columns.forEach((col) => {
    doc.text(col.label, col.x, top + 6, {
      width: col.width,
      align: col.align || 'left',
    });
  });

  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.8)
    .moveTo(left, top)
    .lineTo(right, top)
    .stroke();
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.8)
    .moveTo(left, top + height)
    .lineTo(right, top + height)
    .stroke();

  doc.y = top + height + 4;
  return height;
}

function drawTableRow(doc, { left, right, top, columns, row, stripe }) {
  const height = 20;
  if (stripe) {
    doc
      .save()
      .rect(left, top, right - left, height)
      .fill('#ffffff')
      .restore();
  }

  doc.font('Helvetica').fontSize(9).fillColor('#111827');

  columns.forEach((col) => {
    doc.text(row[col.key] ?? '', col.x, top + 6, {
      width: col.width,
      align: col.align || 'left',
    });
  });

  doc
    .strokeColor('#f1f5f9')
    .lineWidth(0.6)
    .moveTo(left, top + height)
    .lineTo(right, top + height)
    .stroke();

  doc.y = top + height + 2;
  return height;
}

export async function renderOrgAiSubmissionsPdf({
  org,
  classLabel,
  rows,
  rangeFrom,
  rangeTo,
  generatedAt = new Date(),
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const [logoBuf] = await Promise.all([
    tryLoadImageBuffer(org?.logo_url, { w: 240, h: 240, dpr: 2 }),
  ]);

  const subtitleBits = [
    classLabel ? `Class: ${oneline(classLabel)}` : 'All classes',
    rangeFrom || rangeTo
      ? `Range: ${[rangeFrom ? fmtDate(rangeFrom) : null, rangeTo ? fmtDate(rangeTo) : null]
          .filter(Boolean)
          .join(' → ')}`
      : null,
    `Generated: ${fmtDate(generatedAt)}`,
  ].filter(Boolean);

  const drawPageHeader = () =>
    drawHeaderBand(doc, {
      org,
      title: 'AI Course Quiz Results',
      subtitle: subtitleBits.join(' • '),
      logoBuf,
    });

  const { pageHeight, leftMargin, rightMargin, innerWidth } = drawPageHeader();
  const bottomMarginY = pageHeight - 60;

  doc.font('Helvetica-Bold').fontSize(10).text('Summary', leftMargin, doc.y);
  doc.moveDown(0.25);

  const boxTopY = doc.y;
  const boxPad = 10;

  doc
    .save()
    .roundedRect(leftMargin, boxTopY, innerWidth, 56, 8)
    .fill('#ffffff')
    .strokeColor('#e5e7eb')
    .lineWidth(0.8)
    .stroke()
    .restore();

  const summaryLines = [
    ['Class', classLabel || 'All classes'],
    ['Total submissions', String(rows?.length || 0)],
    ['Generated', fmtDate(generatedAt)],
  ];

  summaryLines.forEach(([label, value], idx) => {
    const rowY = boxTopY + boxPad + idx * 14;
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#6b7280')
      .text(`${label}:`, leftMargin + boxPad, rowY, { width: 100 });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#111827')
      .text(String(value), leftMargin + boxPad + 104, rowY, {
        width: innerWidth - (boxPad * 2 + 104),
      });
  });

  doc.y = boxTopY + 56 + 12;

  if (!rows?.length) {
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#6b7280')
      .text('No AI quiz submissions matched the selected filters.', leftMargin, doc.y);
    doc.end();
    return bufferPromise;
  }

  const tableLeft = leftMargin;
  const tableRight = doc.page.width - rightMargin;
  const tableWidth = tableRight - tableLeft;

  const columns = [
    { key: 'student', label: 'Student Name', x: tableLeft, width: tableWidth * 0.55 },
    { key: 'score', label: 'Score', x: tableLeft + tableWidth * 0.55, width: tableWidth * 0.2, align: 'center' },
    { key: 'date', label: 'Attempt Date', x: tableLeft + tableWidth * 0.75, width: tableWidth * 0.25, align: 'right' },
  ];

  let headerTop = doc.y;
  drawTableHeader(doc, { left: tableLeft, right: tableRight, top: headerTop, columns });

  rows.forEach((row, idx) => {
    ensureSpace(doc, bottomMarginY, () => {
      const header = drawPageHeader();
      headerTop = doc.y;
      drawTableHeader(doc, { left: header.leftMargin, right: header.pageWidth - header.rightMargin, top: headerTop, columns });
    }, 40);

    const displayRow = {
      student: oneline(row?.learner_display_name || row?.student_name || 'Learner'),
      score: sanitizeScore(row?.score_pct),
      date: row?.submitted_at ? fmtDate(row.submitted_at) : '—',
    };

    const rowTop = doc.y;
    drawTableRow(doc, {
      left: tableLeft,
      right: tableRight,
      top: rowTop,
      columns,
      row: displayRow,
      stripe: idx % 2 === 0,
    });
  });

  doc.end();
  return bufferPromise;
}
