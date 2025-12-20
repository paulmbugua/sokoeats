// apps/backend/utils/sendNotification.js
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import pool from '../config/db.js';

/* ─────────────────────────────────────────────────────────
 * Settings helper (Option B)
 *  - Reads from app_settings/site_settings/settings (key,value)
 *  - Caches in-memory per-process
 *  - Fallback to ENV if DB not available or key missing
 * ───────────────────────────────────────────────────────── */
const SETTINGS_TABLE_CANDIDATES = ['app_settings', 'site_settings', 'settings'];
const settingsCache = new Map();

/** Detect the first existing settings table (once per process). */
let detectedSettingsTable = null;
async function detectSettingsTable() {
  if (detectedSettingsTable !== null) return detectedSettingsTable;
  try {
    const { rows } = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ANY($1)`,
      [SETTINGS_TABLE_CANDIDATES],
    );
    const names = rows.map((r) => r.table_name);
    detectedSettingsTable =
      SETTINGS_TABLE_CANDIDATES.find((t) => names.includes(t)) || null;
  } catch {
    detectedSettingsTable = null;
  }
  return detectedSettingsTable;
}

/** Get a setting from DB (with cache) or fallback. */
async function getSetting(
  key,
  fallback = process.env[key.toUpperCase()] ?? null,
) {
  if (settingsCache.has(key)) return settingsCache.get(key);

  try {
    const table = await detectSettingsTable();
    if (table) {
      const { rows } = await pool.query(
        `SELECT value FROM ${table} WHERE key = $1 LIMIT 1`,
        [key],
      );
      const val = rows[0]?.value ?? fallback ?? null;
      settingsCache.set(key, val);
      return val;
    }
  } catch {
    // ignore DB errors; use fallback
  }

  const val = fallback ?? null;
  settingsCache.set(key, val);
  return val;
}

/** Pick a public base URL for rare fallback to /uploads/logo.png. */
function getPublicBaseUrl() {
  return (
    process.env.PUBLIC_BACKEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? process.env.PROD_BACKEND_URL
      : process.env.BACKEND_URL) ||
    null
  );
}

/* ─────────────────────────────────────────────────────────
 * Unsubscribe helpers
 * ───────────────────────────────────────────────────────── */
function sign(email) {
  const secret = process.env.UNSUBSCRIBE_SECRET || 'change-me';
  return crypto
    .createHmac('sha256', secret)
    .update(String(email || '').toLowerCase())
    .digest('base64url');
}

function publicWebUrl() {
  // Your public SPA domain
  return process.env.PUBLIC_WEB_URL || 'https://www.daybreaklearner.com';
}

function publicApiUrl() {
  // Prefer a public API base if available; else fall back to backend URL(s)
  return (
    process.env.PUBLIC_API_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? process.env.PROD_BACKEND_URL
      : process.env.BACKEND_URL)
  );
}

/* ─────────────────────────────────────────────────────────
 * Mailer
 * ───────────────────────────────────────────────────────── */
/**
 * Send a branded HTML email notification.
 *
 * @param {Object} options
 * @param {string} options.to       – Recipient email address
 * @param {string} options.subject  – Email subject line
 * @param {string} [options.body]   – Plain-text body only
 * @param {Object} [options.details] – Structured content for the template
 * @param {string} [options.details.intro]    – Introductory text
 * @param {Object} [options.details.items]    – Key/value pairs to render in a table
 * @param {string} [options.details.ctaUrl]   – URL for a call-to-action button
 * @param {string} [options.details.ctaText]  – Text for the button
 * @param {string} [options.details.plainText]– Override plain-text body
 */
export const sendNotification = async ({ to, subject, body, details }) => {
  try {
    // require to & subject, and either body or a valid details.items
    if (!to || !subject || (!body && !(details && details.items))) {
      throw new Error('❌ Missing required email parameters.');
    }

    const isSecure = (process.env.EMAIL_SECURE || '').toLowerCase() === 'true';
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'localhost',
      port: process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : 587,
      secure: isSecure, // true = SSL (465), false = STARTTLS (587)
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // Prefer DB setting -> ENV -> rare fallback to /uploads/logo.png
    const emailLogoUrl = await getSetting(
      'email_logo_url',
      process.env.EMAIL_LOGO_URL,
    );
    const baseUrl = getPublicBaseUrl();
    let logoUrl =
      emailLogoUrl || (baseUrl ? `${baseUrl}/uploads/logo.png` : null);

    // Light cache-buster in non-prod to dodge stubborn image caches during dev
    if (logoUrl && process.env.NODE_ENV !== 'production') {
      logoUrl += (logoUrl.includes('?') ? '&' : '?') + `v=${Date.now()}`;
    }

    // If the caller only passed `body`, wrap it in a minimal details object
    const tpl =
      details && details.items
        ? details
        : { intro: '', items: {}, plainText: body };

    const itemsHtml = Object.keys(tpl.items).length
      ? `<table cellpadding="5" cellspacing="0" style="width:100%;margin:20px 0;border:1px solid #ddd;">
           ${Object.entries(tpl.items)
             .map(
               ([label, value]) => `
             <tr>
               <td style="font-weight:bold;width:30%;background:#f9f9f9;">${label}</td>
               <td>${String(value ?? '')}</td>
             </tr>`,
             )
             .join('')}
         </table>`
      : `<p style="font-size:16px;line-height:1.5;">${body ?? ''}</p>`;

    // Unsubscribe links (visible + headers)
    const token = sign(to);
    const webUnsub = `${publicWebUrl()}/unsubscribe?e=${encodeURIComponent(to)}&t=${token}`;
    const apiOneClick = `${publicApiUrl()}/api/email/unsubscribe/one-click?e=${encodeURIComponent(to)}&t=${token}`;
    const supportEmail =
      process.env.SUPPORT_EMAIL || 'support@daybreaklearner.com';

    // Build the inline-CSS HTML template
    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><title>${subject}</title></head>
    <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation"
                 style="background:#fff;margin:20px 0;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background:#1d4ed8;padding:20px;text-align:center;">
                ${logoUrl ? `<img src="${logoUrl}" alt="DayBreak" width="150" style="display:block;margin:0 auto;">` : ''}
              </td>
            </tr>
            <tr>
              <td style="padding:30px;color:#333;">
                <h1 style="font-size:24px;margin-top:0;">${subject}</h1>
                <p style="font-size:16px;line-height:1.5;">
                  ${tpl.intro || 'Hello,'}
                </p>
                ${itemsHtml}
                ${
                  tpl.ctaUrl
                    ? `
                <p style="text-align:center;margin:30px 0;">
                  <a href="${tpl.ctaUrl}"
                     style="background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 24px;border-radius:4px;display:inline-block;font-weight:bold;">
                    ${tpl.ctaText || 'Take Action'}
                  </a>
                </p>`
                    : ''
                }
                <p style="font-size:14px;color:#666;">
                  If you have any questions, reply to this email or contact ${supportEmail}.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#f4f4f4;padding:20px;text-align:center;font-size:12px;color:#999;">
                © ${new Date().getFullYear()} DayBreak. All rights reserved.<br>
                1830-01000, Thika, Kenya<br>
                <a href="${webUnsub}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
    `;

    const info = await transporter.sendMail({
      from: `"DayBreak 📚" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text:
        (tpl.plainText ||
          [
            subject,
            ...Object.entries(tpl.items).map(([k, v]) => `${k}: ${v}`),
          ].join('\n\n')) +
        `

Unsubscribe: ${webUnsub}
`,
      headers: {
        // Include One-Click + mailto option for mailbox providers
        'List-Unsubscribe': `<${apiOneClick}>, <mailto:${supportEmail}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });

    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
  } catch (err) {
    console.error(`❌ Error sending email to ${to}:`, err.message);
    throw err;
  }
};
