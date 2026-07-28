import nodemailer from 'nodemailer';

function env(name, fallback = '') {
  return String(process.env[name] || fallback || '').trim();
}

function maskEmail(email) {
  return String(email || '').replace(/^(.{2}).*(@.*)$/, '$1***$2');
}

export function hasEmailConfig() {
  return Boolean(
    env('EMAIL_HOST', process.env.SMTP_HOST) &&
      env('EMAIL_AUTH_USER', process.env.SMTP_USER || process.env.EMAIL_USER) &&
      env('EMAIL_AUTH_PASS', process.env.SMTP_PASS || process.env.EMAIL_PASS)
  );
}

function createTransporter() {
  const host = env('EMAIL_HOST', process.env.SMTP_HOST || 'smtp.zoho.com');
  const port = Number(env('EMAIL_PORT', process.env.SMTP_PORT || '587')) || 587;
  const secureValue = env('EMAIL_SECURE', process.env.SMTP_SECURE || 'false').toLowerCase();
  const secure = secureValue === 'true' || port === 465;
  const user = env('EMAIL_AUTH_USER', process.env.SMTP_USER || process.env.EMAIL_USER);
  const pass = env('EMAIL_AUTH_PASS', process.env.SMTP_PASS || process.env.EMAIL_PASS);

  if (!host || !user || !pass) {
    const error = new Error('Email is not configured. Set EMAIL_HOST plus EMAIL_AUTH_USER/EMAIL_AUTH_PASS or SMTP_USER/SMTP_PASS.');
    error.code = 'EMAIL_CONFIG_MISSING';
    throw error;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: { user, pass },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 30000,
    tls: {
      servername: host,
      minVersion: 'TLSv1.2',
    },
  });
}

export async function sendOtpEmail({ to, otp, purpose = 'verification' }) {
  const fromEmail = env('EMAIL_FROM', process.env.MAIL_FROM_ADDRESS || process.env.SMTP_FROM || 'noreply@ekazi.co.ke');
  const fromName = env('EMAIL_FROM_NAME', process.env.MAIL_FROM_NAME || process.env.SMTP_FROM_NAME || 'Ekazi');
  const authUser = env('EMAIL_AUTH_USER', process.env.SMTP_USER || process.env.EMAIL_USER);
  const action = purpose === 'password_reset' ? 'reset your Ekazi password' : 'verify your Ekazi phone number';
  const subject = 'Your Ekazi verification code';
  const text = `Your Ekazi code is ${otp}. Use it to ${action}. It expires in 10 minutes. Do not share this code.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 12px">Your Ekazi code</h2>
      <p>Use this code to ${action}.</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:6px;margin:18px 0;color:#16a34a">${otp}</div>
      <p>This code expires in 10 minutes. Do not share it with anyone.</p>
    </div>
  `;

  console.log('[email][otp] send:start', {
    to: maskEmail(to),
    from: fromEmail,
    authUser: maskEmail(authUser),
    host: env('EMAIL_HOST', process.env.SMTP_HOST || 'smtp.zoho.com'),
  });
  const result = await createTransporter().sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject,
    text,
    html,
    replyTo: env('EMAIL_REPLY_TO', process.env.MAIL_REPLY_TO || fromEmail),
    envelope: { from: fromEmail, to },
  });
  console.log('[email][otp] send:ok', { to: maskEmail(to), messageId: result.messageId });
  return { sent: true, email: maskEmail(to), messageId: result.messageId };
}
