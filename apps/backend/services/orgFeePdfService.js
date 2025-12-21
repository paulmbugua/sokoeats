import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';

const money = (amt, currency = 'USD') => {
  const n = Number(amt || 0) / 100;
  return `${currency} ${n.toFixed(2)}`;
};

function header(doc, title, org) {
  doc
    .fontSize(18)
    .text(org?.name || 'Organization', { align: 'left', continued: false })
    .moveDown(0.25);
  if (org?.address_line1) doc.fontSize(10).text(org.address_line1);
  if (org?.address_line2) doc.fontSize(10).text(org.address_line2);
  if (org?.phone_number || org?.contact_email) {
    doc
      .fontSize(10)
      .text([org.phone_number, org.contact_email].filter(Boolean).join(' • '));
  }
  doc.moveDown(0.5);
  doc.fontSize(14).text(title, { underline: true });
  doc.moveDown(0.5);
}

async function toBuffer(doc) {
  const stream = doc.pipe(new PassThrough());
  doc.end();
  return getStream.buffer(stream);
}

export async function renderFeeStructurePdf({ org, structure }) {
  const doc = new PDFDocument({ margin: 50 });
  header(doc, 'Fee Structure', org);

  doc.fontSize(12).text(structure.title || 'Structure', { continued: false });
  if (structure.description) {
    doc.moveDown(0.25).fontSize(10).text(structure.description);
  }
  if (structure.effective_term) {
    doc.moveDown(0.25).fontSize(10).text(`Term: ${structure.effective_term}`);
  }
  doc.moveDown();

  const items = structure.items || [];
  if (!items.length) {
    doc.fontSize(11).text('No items configured.');
    return toBuffer(doc);
  }

  doc.fontSize(11).text('Items', { underline: true });
  doc.moveDown(0.25);

  items.forEach((item) => {
    doc
      .fontSize(11)
      .text(`${item.label}`, { continued: false })
      .fontSize(10)
      .text(`${money(item.amount_cents, item.currency || structure.currency)}${
        item.cadence ? ` • ${item.cadence}` : ''
      }${item.is_optional ? ' (optional)' : ''}`);
    if (item.metadata && Object.keys(item.metadata || {}).length) {
      doc
        .fillColor('#555')
        .fontSize(9)
        .text(JSON.stringify(item.metadata));
      doc.fillColor('#000');
    }
    doc.moveDown(0.35);
  });

  return toBuffer(doc);
}

export async function renderFeeStatementPdf({ org, learnerId, entries, totals }) {
  const doc = new PDFDocument({ margin: 50 });
  header(doc, 'Fee Statement', org);

  doc.fontSize(11).text(`Learner: ${learnerId}`);
  doc.moveDown();

  const rows = entries || [];
  if (!rows.length) {
    doc.fontSize(11).text('No charges or payments on record.');
    return toBuffer(doc);
  }

  doc.fontSize(11).text('Transactions', { underline: true });
  doc.moveDown(0.25);

  rows.forEach((row) => {
    const chargeLine = row.charge_id
      ? `Charge #${row.charge_id}: ${money(row.charge_amount, row.charge_currency)} ${
          row.description ? `- ${row.description}` : ''
        }`
      : null;
    if (chargeLine) doc.text(chargeLine);
    if (row.payment_id) {
      doc
        .fontSize(10)
        .text(
          `  Payment #${row.payment_id}: ${money(row.payment_amount, row.payment_currency)}${
            row.method ? ` via ${row.method}` : ''
          }${row.reference ? ` (${row.reference})` : ''}`,
        );
    }
    doc.moveDown(0.3);
  });

  doc.moveDown();
  doc.fontSize(12).text('Summary', { underline: true });
  doc.fontSize(11).text(`Total Charges: ${money(totals.totalCharges)}`);
  doc.fontSize(11).text(`Total Payments: ${money(totals.totalPayments)}`);
  doc.fontSize(11).text(`Balance: ${money(totals.balance)}`);

  return toBuffer(doc);
}
