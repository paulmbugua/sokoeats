import PDFDocument from 'pdfkit';
import getStream from 'get-stream';
import { PassThrough } from 'stream';

async function toBuffer(doc) {
  const stream = doc.pipe(new PassThrough());
  doc.end();
  return getStream.buffer(stream);
}

export async function renderAnnouncementPdf({ announcement }) {
  const doc = new PDFDocument({ margin: 50 });
  doc.fontSize(18).text(announcement?.title || 'Announcement', { underline: true });
  doc.moveDown(0.5);

  if (announcement?.category) {
    doc.fontSize(11).text(`Category: ${announcement.category}`);
  }
  if (announcement?.meeting_at) {
    doc.fontSize(11).text(`Meeting: ${new Date(announcement.meeting_at).toLocaleString()}`);
  }
  if (announcement?.meeting_location) {
    doc.fontSize(11).text(`Location: ${announcement.meeting_location}`);
  }
  if (announcement?.meeting_url) {
    doc.fontSize(11).text(`URL: ${announcement.meeting_url}`);
  }
  doc.moveDown(0.5);

  if (announcement?.body) {
    doc.fontSize(12).text(announcement.body, { width: 500 });
    doc.moveDown(0.5);
  }

  if (announcement?.agenda_md) {
    doc.fontSize(12).text('Agenda:', { underline: true });
    doc.moveDown(0.25);
    doc.fontSize(11).text(announcement.agenda_md);
  }

  return toBuffer(doc);
}
