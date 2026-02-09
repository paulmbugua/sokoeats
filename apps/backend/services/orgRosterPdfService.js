import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';
import { fetchAssetBuffer } from '../utils/fetchAssetBuffer.js';

const oneline = (v) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim();

async function tryLoadImageBuffer(idOrUrl) {
  if (!idOrUrl) return null;
  return fetchAssetBuffer(idOrUrl, { resourceType: 'image' });
}

function drawSignatures(doc, { pageWidth, pageHeight, leftMargin, rightMargin, innerWidth, teacherSigBuf, principalSigBuf }) {
  const signatureBlockHeight = 90;
  const sigBlockTop = Math.max(doc.y, pageHeight - signatureBlockHeight - 80);

  const separatorY = sigBlockTop - 6;
  doc
    .strokeColor('#e5e7eb')
    .lineWidth(0.7)
    .moveTo(leftMargin, separatorY)
    .lineTo(pageWidth - rightMargin, separatorY)
    .stroke();

  const sigColumnWidth = innerWidth * 0.38;
  const teacherX = leftMargin;
  const principalX = pageWidth - rightMargin - sigColumnWidth;

  const labelY = sigBlockTop + 4;
  const sigImageMaxHeight = 45;
  const labelToSigGap = 10;

  // Teacher
  doc.font('Helvetica').fontSize(8).fillColor('#111827').text('Class teacher / Instructor', teacherX, labelY, {
    width: sigColumnWidth,
    align: 'left',
  });

  const teacherSigTopY = labelY + labelToSigGap;
  let teacherSigBottomY = teacherSigTopY + sigImageMaxHeight;

  if (teacherSigBuf) {
    try {
      const sigW = Math.min(sigColumnWidth - 20, 220);
      const sigX = teacherX + (sigColumnWidth - sigW) / 2;
      doc.image(teacherSigBuf, sigX, teacherSigTopY, { fit: [sigW, sigImageMaxHeight] });
    } catch {}
  }

  // Principal
  const principalLabel = 'Head teacher / Principal';
  doc.font('Helvetica').fontSize(8).fillColor('#111827').text(principalLabel, principalX, labelY, {
    width: sigColumnWidth,
    align: 'right',
  });

  const principalSigTopY = labelY + labelToSigGap;
  let principalSigBottomY = principalSigTopY + sigImageMaxHeight;

  if (principalSigBuf) {
    try {
      const sigW = Math.min(sigColumnWidth - 20, 220);
      const labelWidth = doc.widthOfString(principalLabel);
      const labelRight = principalX + sigColumnWidth;
      const labelCenterX = labelRight - labelWidth / 2;
      const sigX = labelCenterX - sigW / 2;

      doc.image(principalSigBuf, sigX, principalSigTopY, { fit: [sigW, sigImageMaxHeight] });
    } catch {}
  }

  const sigLineY = Math.max(teacherSigBottomY, principalSigBottomY) + 4;

  doc.strokeColor('#d1d5db').lineWidth(0.9);
  doc.moveTo(teacherX, sigLineY).lineTo(teacherX + sigColumnWidth, sigLineY).stroke();
  doc.moveTo(principalX, sigLineY).lineTo(principalX + sigColumnWidth, sigLineY).stroke();
}

export async function renderOrgLearnerRosterPdf({
  org,
  classLabel,
  learners,
  teacherSignatureUrl,
  principalSignatureUrl,
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const pass = new PassThrough();
  const bufferPromise = getStream.buffer(pass);
  doc.pipe(pass);

  const pageWidth = Number(doc.page.width) || 595.28;
  const pageHeight = Number(doc.page.height) || 841.89;
  const leftMargin = Number(doc.page.margins?.left) || 40;
  const rightMargin = Number(doc.page.margins?.right) || 40;
  const innerWidth = pageWidth - leftMargin - rightMargin;

  const headerHeight = 70;
  const bottomContentY = pageHeight - 160; // reserve signatures + footer
  const today = new Date().toLocaleString();

  const schoolName = oneline(org?.name || 'School');
  const classLine = oneline(classLabel || 'All classes');

  const [logoBuf, principalSigBuf, teacherSigBuf] = await Promise.all([
    tryLoadImageBuffer(org?.logo_url, { w: 240, h: 240, trim: false, exact: false, dpr: 2 }),
    tryLoadImageBuffer(principalSignatureUrl, { w: 520, h: 200, trim: true, exact: false, dpr: 2 }),
    tryLoadImageBuffer(teacherSignatureUrl, { w: 520, h: 200, trim: true, exact: false, dpr: 2 }),
  ]);

  const drawHeader = () => {
    doc.save().rect(0, 0, pageWidth, headerHeight).fill('#f3f4f6').restore();

    if (logoBuf) {
      try {
        doc.image(logoBuf, leftMargin, 14, { fit: [48, 48] });
      } catch {}
    }

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(17)
      .text(schoolName, leftMargin + (logoBuf ? 60 : 0), 18, {
        width: innerWidth - (logoBuf ? 60 : 0),
        align: 'center',
      });

    const contactBits = [org?.address_line1, org?.address_line2].filter((x) => x && oneline(x));
    const contactInlineBits = [
      org?.phone_number && `Tel: ${oneline(org.phone_number)}`,
      org?.contact_email && `Email: ${oneline(org.contact_email)}`,
      org?.website_url && `Website: ${oneline(org.website_url)}`,
    ].filter(Boolean);

    const lines = [...contactBits, contactInlineBits.length ? contactInlineBits.join('   •   ') : null].filter(Boolean);

    let lastY = 32;
    if (lines.length) {
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      lines.forEach((line, idx) => {
        const y = 40 + idx * 10;
        doc.text(String(line), leftMargin + (logoBuf ? 60 : 0), y, {
          width: innerWidth - (logoBuf ? 60 : 0),
          align: 'center',
        });
        lastY = y + 10;
      });
    }

    const titleY = Math.max(headerHeight - 8, lastY + 6);

    doc
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('LEARNER ROSTER', leftMargin, titleY, { width: innerWidth, align: 'center' });

    const ruleY = titleY + 14;

    doc.moveTo(leftMargin, ruleY).lineTo(pageWidth - rightMargin, ruleY).strokeColor('#d1d5db').lineWidth(0.8).stroke();

    doc.y = ruleY + 10;

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#374151')
      .text(`Class: ${classLine}   •   Printed: ${today}   •   Total: ${learners.length}`, leftMargin, doc.y, {
        width: innerWidth,
        align: 'center',
      });

    doc.y += 16;
    doc.fillColor('#111827');
  };

  const ensureSpace = (minHeight = 20) => {
    if (doc.y + minHeight <= bottomContentY) return;
    doc.addPage();
    drawHeader();
  };

  // first header
  drawHeader();

  // Table header
  const colNumW = 28;
  const colAdmW = 110;
  const colNameW = 200;
  const colEmailW = innerWidth - (colNumW + colAdmW + colNameW);

  const tableLeft = leftMargin;
  const colNum = tableLeft;
  const colAdm = colNum + colNumW;
  const colName = colAdm + colAdmW;
  const colEmail = colName + colNameW;
  const tableRight = tableLeft + innerWidth;

  const rowH = 16;

  const drawTableHeader = () => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');

    const y = doc.y;
    doc.text('#', colNum, y, { width: colNumW - 6 });
    doc.text('ADMISSION', colAdm, y, { width: colAdmW - 6 });
    doc.text('NAME', colName, y, { width: colNameW - 6 });
    doc.text('EMAIL', colEmail, y, { width: colEmailW - 6 });

    const y2 = y + rowH;

    doc.strokeColor('#9ca3af').lineWidth(0.7);
    doc.moveTo(tableLeft, y).lineTo(tableRight, y).stroke();
    doc.moveTo(tableLeft, y2).lineTo(tableRight, y2).stroke();
    doc.moveTo(tableLeft, y).lineTo(tableLeft, y2).stroke();
    doc.moveTo(colAdm, y).lineTo(colAdm, y2).stroke();
    doc.moveTo(colName, y).lineTo(colName, y2).stroke();
    doc.moveTo(colEmail, y).lineTo(colEmail, y2).stroke();
    doc.moveTo(tableRight, y).lineTo(tableRight, y2).stroke();

    doc.y = y2;
    doc.font('Helvetica').fontSize(9).fillColor('#111827');
  };

  drawTableHeader();

  // Rows
  for (let i = 0; i < learners.length; i += 1) {
    ensureSpace(rowH + 2);

    const u = learners[i];
    const y = doc.y;
    const num = String(i + 1);
    const adm = oneline((u && u.admission_code) || (u && u.profile?.admission_code) || '');
    const name = oneline(u?.name || u?.email || `User #${u?.id}`);
    const email = oneline(u?.email || '');

    doc.text(num, colNum, y + 4, { width: colNumW - 6 });
    doc.text(adm || '—', colAdm, y + 4, { width: colAdmW - 6 });
    doc.text(name || '—', colName, y + 4, { width: colNameW - 6 });
    doc.text(email || '—', colEmail, y + 4, { width: colEmailW - 6 });

    const y2 = y + rowH;

    doc.strokeColor('#e5e7eb').lineWidth(0.6);
    doc.moveTo(tableLeft, y).lineTo(tableRight, y).stroke();
    doc.moveTo(tableLeft, y2).lineTo(tableRight, y2).stroke();
    doc.moveTo(tableLeft, y).lineTo(tableLeft, y2).stroke();
    doc.moveTo(colAdm, y).lineTo(colAdm, y2).stroke();
    doc.moveTo(colName, y).lineTo(colName, y2).stroke();
    doc.moveTo(colEmail, y).lineTo(colEmail, y2).stroke();
    doc.moveTo(tableRight, y).lineTo(tableRight, y2).stroke();

    doc.y = y2;
  }

  // Signatures (last page)
  ensureSpace(120);
  doc.moveDown(0.6);

  drawSignatures(doc, {
    pageWidth,
    pageHeight,
    leftMargin,
    rightMargin,
    innerWidth,
    teacherSigBuf,
    principalSigBuf,
  });

  doc.end();
  return bufferPromise;
}
