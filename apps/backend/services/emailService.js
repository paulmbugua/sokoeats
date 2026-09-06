import nodemailer from 'nodemailer';
import pool from '../config/db.js';

let transporter;
let workerBusy = false;

function mailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASS must be configured');
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: { user, pass },
  };
}

function mailer() {
  if (!transporter) transporter = nodemailer.createTransport(mailConfig());
  return transporter;
}

export async function verifyEmailTransport() {
  await mailer().verify();
  return true;
}

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
}[character]));

export async function queuePartnerApprovalEmail(client, partner) {
  const role = partner.role === 'merchant' ? 'Merchant' : 'Vendor';
  const dashboardUrl = process.env.STORE_OPERATIONS_URL || process.env.WEB_APP_URL || 'https://sokoeats.co.ke';
  const supportEmail = process.env.SOKOEATS_LEGAL_EMAIL || process.env.MAIL_REPLY_TO || 'support@sokoeats.co.ke';
  const subject = `Your SokoEats ${role.toLowerCase()} application is approved`;
  const text = [
    `Hello ${partner.ownerName},`, '',
    `Your ${role.toLowerCase()} application for ${partner.shopName} has been verified and approved.`,
    partner.applicationReference ? `Application tracking number: ${partner.applicationReference}` : '',
    `You can now sign in to Store Operations, complete your catalogue and start receiving orders: ${dashboardUrl}`,
    `For help, contact ${supportEmail}.`, '', 'SokoEats Partner Operations',
  ].filter(Boolean).join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#f2f6f3;font-family:Arial,sans-serif;color:#14231d"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce6df"><tr><td style="padding:22px 28px;background:#10231d;color:#fff"><strong style="font-size:22px">SokoEats</strong><div style="margin-top:5px;color:#ffad55;font-size:12px">PARTNER OPERATIONS</div></td></tr><tr><td style="padding:30px 28px"><div style="display:inline-block;padding:7px 10px;background:#e3f5e9;color:#12683c;font-size:12px;font-weight:bold">APPLICATION APPROVED</div><h1 style="margin:18px 0 12px;font-size:27px;line-height:1.2">Your shop is ready for SokoEats</h1><p style="line-height:1.6">Hello ${escapeHtml(partner.ownerName)},</p><p style="line-height:1.6">Your ${role.toLowerCase()} application for <strong>${escapeHtml(partner.shopName)}</strong> has been verified and approved.</p>${partner.applicationReference ? `<div style="margin:22px 0;padding:15px;background:#f3f6f4;border-left:4px solid #ff920f"><small style="display:block;color:#637169">APPLICATION TRACKING NUMBER</small><strong>${escapeHtml(partner.applicationReference)}</strong></div>` : ''}<p style="line-height:1.6">Sign in to Store Operations to complete your catalogue, manage availability and start receiving orders.</p><p style="margin:26px 0"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:13px 19px;background:#11683e;color:#fff;text-decoration:none;font-weight:bold">Open Store Operations</a></p><p style="color:#637169;font-size:13px;line-height:1.6">Need help? Email <a href="mailto:${escapeHtml(supportEmail)}" style="color:#11683e">${escapeHtml(supportEmail)}</a>.</p></td></tr></table></td></tr></table></body></html>`;
  const { rows } = await client.query(
    `INSERT INTO sokoeats_email_outbox (dedupe_key,recipient,subject,text_body,html_body,metadata)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [`partner-approved:${partner.vendorId}`, partner.email, subject, text, html, JSON.stringify({ vendorId: partner.vendorId, role: partner.role, template: 'partner-approved' })],
  );
  return rows[0]?.id || null;
}

async function claimEmail(id) {
  const params = id ? [id] : [];
  const filter = id ? 'id=$1 AND' : '';
  const { rows } = await pool.query(
    `WITH candidate AS (
       SELECT id FROM sokoeats_email_outbox
       WHERE ${filter} status IN ('pending','failed') AND next_attempt_at<=NOW()
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE sokoeats_email_outbox o SET status='sending',attempts=o.attempts+1,updated_at=NOW()
     FROM candidate WHERE o.id=candidate.id RETURNING o.*`,
    params,
  );
  return rows[0] || null;
}

export async function dispatchQueuedEmail(id) {
  const email = await claimEmail(id);
  if (!email) return { status: 'not_pending' };
  try {
    const fromAddress = process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER;
    const fromName = process.env.MAIL_FROM_NAME || 'SokoEats';
    const result = await mailer().sendMail({
      from: { name: fromName, address: fromAddress },
      replyTo: process.env.MAIL_REPLY_TO || 'support@sokoeats.co.ke',
      to: email.recipient,
      subject: email.subject,
      text: email.text_body,
      html: email.html_body,
    });
    await pool.query(`UPDATE sokoeats_email_outbox SET status='sent',provider_message_id=$2,sent_at=NOW(),last_error=NULL,updated_at=NOW() WHERE id=$1`, [email.id, result.messageId || null]);
    console.info('[SokoEats][Email] sent', { outboxId: email.id, template: email.metadata?.template, recipientDomain: email.recipient.split('@')[1] });
    return { status: 'sent' };
  } catch (error) {
    const delayMinutes = Math.min(60, 2 ** Math.min(email.attempts, 5));
    await pool.query(
      `UPDATE sokoeats_email_outbox SET status='failed',last_error=$2,next_attempt_at=NOW()+($3*INTERVAL '1 minute'),updated_at=NOW() WHERE id=$1`,
      [email.id, String(error.message || error).slice(0, 1000), delayMinutes],
    );
    console.warn('[SokoEats][Email] delivery-failed', { outboxId: email.id, attempt: email.attempts, message: error.message });
    return { status: 'queued' };
  }
}

async function sweepEmailOutbox() {
  if (workerBusy) return;
  workerBusy = true;
  try {
    for (let index = 0; index < 10; index += 1) {
      const result = await dispatchQueuedEmail();
      if (result.status === 'not_pending') break;
    }
  } finally {
    workerBusy = false;
  }
}

export function startEmailWorker() {
  const intervalMs = Math.max(15000, Number(process.env.EMAIL_OUTBOX_SWEEP_MS || 60000));
  void sweepEmailOutbox().catch(error => console.warn('[SokoEats][Email] worker-error', { message: error.message }));
  const timer = setInterval(() => void sweepEmailOutbox().catch(error => console.warn('[SokoEats][Email] worker-error', { message: error.message })), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
