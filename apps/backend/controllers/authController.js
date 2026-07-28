import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';
import { normalizeProviderServices, providerServiceLimitError, validateProviderServiceSelection } from '../services/providerServiceLimit.js';
import { sendNotification } from '../utils/sendNotification.js';
import { hasSmsConfig, sendOtpSms } from '../services/smsService.js';
import { sendOtpEmail } from '../services/emailOtpService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ekazi-dev-secret';
// Temporarily bypass SMS/Email OTP until the OTP delivery flow is reactivated.
const OTP_AUTH_DISABLED = true;
let schemaReady;

const googleClient = new OAuth2Client();
const GOOGLE_AUDIENCES = [
  process.env.GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_WEB,
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_IOS,
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_CLIENT_ID_ANDROID,
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  '912636242362-m5hogktgcnramtb6g132aada1jftsfrl.apps.googleusercontent.com',
  '557799973381-ksp83t2vo6fdqufhm0iie06lnb4e8j8v.apps.googleusercontent.com',
  '557799973381-g0h98g6vg82oeineeb4t9e67hgosdfrg.apps.googleusercontent.com',
  '557799973381-97lsoficotiiulhl5st6tf6h723uurpg.apps.googleusercontent.com',
  '164509786898-7ca20l8gli2hia1d8p06r55v81p9f2nh.apps.googleusercontent.com',
  '164509786898-ujoi1s2k3763bhh5mgtdf6if90bnakjb.apps.googleusercontent.com',
  '164509786898-l6t6vck6qa44s9b2hc609ts3kbihl3sv.apps.googleusercontent.com',
  '164509786898-0scm5333pfeligj0eu15olvlvluf4k6j.apps.googleusercontent.com',
].filter(Boolean);


function googleAuthRequestId() {
  return `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function logGoogleAuth(requestId, step, details = {}) {
  console.log('[google-auth][backend]', step, { requestId, ...details });
}

function googleEmailDomain(email) {
  return typeof email === 'string' && email.includes('@') ? email.split('@').pop() : undefined;
}

function decodeJwtPayloadUnsafe(idToken) {
  try {
    const [, payload] = String(idToken || '').split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (error) {
    return { decodeError: error instanceof Error ? error.message : String(error) };
  }
}

function summarizeIncomingGoogleToken(idToken) {
  const token = String(idToken || '');
  const payload = decodeJwtPayloadUnsafe(token);
  return {
    hasToken: Boolean(token),
    tokenLength: token.length,
    partCount: token ? token.split('.').length : 0,
    aud: payload?.aud,
    azp: payload?.azp,
    iss: payload?.iss,
    emailDomain: googleEmailDomain(payload?.email),
    emailVerified: payload?.email_verified,
    exp: payload?.exp,
    iat: payload?.iat,
    decodeError: payload?.decodeError,
  };
}

function maskPhone(value) {
  const phone = String(value || '');
  return phone.length <= 7 ? phone : phone.slice(0, 5) + '***' + phone.slice(-3);
}

function createOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function canExposeDevOtp() {
  return process.env.NODE_ENV !== 'production' && process.env.EXPOSE_DEV_OTP === '1';
}

function normalizeOtpDeliveryMethod(value) {
  return String(value || '').toLowerCase() === 'email' ? 'email' : 'sms';
}

function normalizePhone(value) {
  let phone = String(value || '').trim().replace(/[\s()-]/g, '');
  if (phone.startsWith('0')) phone = `+254${phone.slice(1)}`;
  else if (phone.startsWith('254')) phone = `+${phone}`;
  return /^\+254[17]\d{8}$/.test(phone) ? phone : null;
}

function createToken(id) {
  return jwt.sign({ id: Number(id), scope: 'ekazi-mobile' }, JWT_SECRET, { expiresIn: '30d' });
}


function createTwoFactorToken(user) {
  return jwt.sign(
    { id: Number(user.id), phone: user.phone, scope: 'ekazi-2fa' },
    JWT_SECRET,
    { expiresIn: '10m' },
  );
}

function verifyTwoFactorToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), JWT_SECRET);
    if (payload?.scope !== 'ekazi-2fa' || !Number.isSafeInteger(Number(payload.id))) return null;
    return payload;
  } catch {
    return null;
  }
}

async function startTwoFactorChallenge(user, purpose = 'login') {
  if (OTP_AUTH_DISABLED) {
    return { token: createToken(user.id), user: publicUser({ ...user, phone_verified: true }), twoFactorBypassed: true, purpose };
  }
  if (!user?.phone) {
    return {
      requiresPhone: true,
      message: 'Add a Kenyan phone number before signing in. It is required for account security.',
      user: publicUser(user),
    };
  }
  return {
    requiresTwoFactor: true,
    requiresDeliveryChoice: true,
    twoFactorToken: createTwoFactorToken(user),
    phone: user.phone,
    maskedPhone: maskPhone(user.phone),
    purpose,
    challenge: { requiresDeliveryChoice: true, phone: maskPhone(user.phone), deliveryMethods: ['sms', 'email'] },
    user: publicUser(user),
  };
}

function isProfileComplete(user) {
  return Boolean(user?.phone && (OTP_AUTH_DISABLED || user?.phone_verified) && user?.profile_completed_at);
}

function profileRequirements(user) {
  const missing = [];
  if (!user?.phone) missing.push('phone');
  if (!OTP_AUTH_DISABLED && user?.phone && !user?.phone_verified) missing.push('phone_verification');
  if (!user?.name || user.name === 'Ekazi User') missing.push('name');
  if (!user?.profile_completed_at) missing.push('profile_details');
  return missing;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role === 'tutor' ? 'handyman' : 'client',
    emailVerified: Boolean(user.email_verified),
    phoneVerified: Boolean(user.phone && (OTP_AUTH_DISABLED || user.phone_verified)),
    profileComplete: isProfileComplete(user),
    profileRequiredActions: profileRequirements(user),
    preferredCity: user.preferred_city || null,
    preferredEstate: user.preferred_estate || null,
    contactPreference: user.contact_preference || 'phone',
  };
}

function isSyntheticMobileEmail(email) {
  return /@mobile\.ekazi\.co\.ke$/i.test(String(email || ''));
}

function hashEmailToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function publicApiUrl() {
  return String(
    process.env.PUBLIC_API_URL ||
      process.env.PUBLIC_BACKEND_URL ||
      process.env.PROD_BACKEND_URL ||
      process.env.BACKEND_URL ||
      'https://server.ekazi.co.ke',
  ).replace(/\/+$/, '');
}

function createEmailToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashEmailToken(token),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };
}

const OTP_RESEND_DELAYS_SECONDS = [120, 300, 300];

function otpDelayForAttempt(resendCount = 0) {
  return OTP_RESEND_DELAYS_SECONDS[Math.min(Math.max(Number(resendCount) || 0, 0), OTP_RESEND_DELAYS_SECONDS.length - 1)];
}

function secondsUntilOtpResend(user) {
  if (!user?.otp_last_sent_at) return 0;
  const elapsedSeconds = Math.floor((Date.now() - new Date(user.otp_last_sent_at).getTime()) / 1000);
  return Math.max(0, otpDelayForAttempt(user.otp_resend_count) - elapsedSeconds);
}

function otpResendMeta(user, extra = {}) {
  const resendCount = Number(user?.otp_resend_count || 0);
  return {
    resendCount,
    smsAttemptsRemaining: Math.max(0, 3 - resendCount),
    nextResendSeconds: secondsUntilOtpResend(user),
    emailFallbackAvailable: resendCount >= 3,
    ...extra,
  };
}

async function sendOtpEmailFallback(user, otp, purpose = 'verification') {
  if (!user?.email || isSyntheticMobileEmail(user.email)) return { sent: false, skipped: true, reason: 'missing_email' };
  const email = await sendOtpEmail({ to: user.email, otp, purpose });
  await pool.query('UPDATE users SET otp_email_sent_at = NOW() WHERE id = $1', [user.id]);
  return email;
}

async function sendOrResendOtp({ user, phone, purpose, initial = false, deliveryMethod = 'sms' }) {
  deliveryMethod = normalizeOtpDeliveryMethod(deliveryMethod);
  const resendCount = Number(user?.otp_resend_count || 0);
  const existingOtpValid = user?.otp && user?.otp_expiration && new Date(user.otp_expiration).getTime() > Date.now();
  const otp = existingOtpValid ? user.otp : createOtp();

  if (!initial) {
    const waitSeconds = secondsUntilOtpResend(user);
    if (waitSeconds > 0) {
      return otpResendMeta(user, { ok: true, sent: false, rateLimited: true, phone: maskPhone(phone), expiresInMinutes: 10 });
    }
  }

  await pool.query(
    `UPDATE users
        SET otp = $1,
            otp_expiration = NOW() + INTERVAL '10 minutes',
            otp_last_sent_at = NOW(),
            otp_resend_count = CASE WHEN $3::boolean THEN 0 ELSE otp_resend_count + 1 END,
            otp_email_sent_at = NULL
      WHERE id = $2`,
    [otp, user.id, Boolean(initial)],
  );
  const updatedUser = { ...user, otp_resend_count: initial ? 0 : resendCount + 1, otp_last_sent_at: new Date().toISOString() };
  if (deliveryMethod === 'email') {
    const email = await sendOtpEmailFallback(user, otp, purpose);
    return otpResendMeta(updatedUser, {
      ok: true,
      deliveryMethod,
      phone: maskPhone(phone),
      sent: Boolean(email.sent),
      emailSent: Boolean(email.sent),
      emailFallback: email,
      expiresInMinutes: 10,
      ...(canExposeDevOtp() ? { otp } : {}),
    });
  }
  const sms = await sendOtpSms(phone, otp, purpose);
  return otpResendMeta(updatedUser, {
    ok: true,
    deliveryMethod,
    phone: maskPhone(phone),
    sent: Boolean(sms.sent),
    smsFailure: sms.sent ? undefined : { reason: sms.reason || 'recipient_not_delivered', statusCode: sms.statusCode || null },
    expiresInMinutes: 10,
    ...(canExposeDevOtp() ? { otp } : {}),
  });
}

async function sendEmailConfirmation(user) {
  if (!user?.email || isSyntheticMobileEmail(user.email)) return { sent: false, skipped: true };
  const { token, tokenHash, expiresAt } = createEmailToken();
  await pool.query(
    `UPDATE users
        SET email_verification_token_hash = $1,
            email_verification_expires_at = $2
      WHERE id = $3`,
    [tokenHash, expiresAt, user.id],
  );
  const confirmUrl = `${publicApiUrl()}/api/auth/email/confirm?token=${encodeURIComponent(token)}`;
  await sendNotification({
    to: user.email,
    subject: 'Confirm your Ekazi email',
    kind: 'email_confirmation',
    details: {
      intro: `Hi ${user.name || 'there'}, confirm this email address to secure your Ekazi account.`,
      items: {
        Account: user.email,
        Expires: '24 hours',
      },
      ctaUrl: confirmUrl,
      ctaText: 'Confirm email',
      plainText: `Confirm your Ekazi email by opening this link: ${confirmUrl}\n\nThis link expires in 24 hours.`,
    },
  });
  return { sent: true, expiresAt };
}

async function ensureMobileAuthSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT');
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'users_role_check'
              AND conrelid = 'public.users'::regclass
          ) THEN
            ALTER TABLE users DROP CONSTRAINT users_role_check;
          END IF;
          ALTER TABLE users
            ADD CONSTRAINT users_role_check CHECK (role IS NULL OR btrim(role) <> '');
        END $$;
      `);
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(32)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(128)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp VARCHAR(12)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expiration TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_resend_count INTEGER NOT NULL DEFAULT 0');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_last_sent_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_email_sent_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_city TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_estate TEXT');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS emergency_contact VARCHAR(32)');
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_preference TEXT');
      await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key');
      await pool.query('DROP INDEX IF EXISTS users_phone_unique_idx');
      await pool.query(
        'CREATE INDEX IF NOT EXISTS users_phone_lookup_idx ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL',
      );
      await pool.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_unique_idx ON users (google_id) WHERE google_id IS NOT NULL',
      );
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  return schemaReady;
}

async function ensureHandymanProfile(user) {
  if (user.role !== 'tutor') return;
  await ensureMarketplaceSchema();
  await pool.query(
    `INSERT INTO ekazi_handyman_profiles (user_id, business_name)
     VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING`,
    [user.id, user.name],
  );
}

async function verifyGoogleIdToken(idToken) {
  const options = { idToken };
  if (GOOGLE_AUDIENCES.length) options.audience = GOOGLE_AUDIENCES;
  const ticket = await googleClient.verifyIdToken(options);
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload?.email) return null;
  return payload;
}

export const register = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    const suppliedEmail = String(req.body?.email || '').trim().toLowerCase();
    const accountType = req.body?.role === 'handyman' ? 'handyman' : 'client';
    const databaseRole = accountType === 'handyman' ? 'tutor' : 'student';
    const syntheticEmail = phone ? `${phone.slice(1)}.${crypto.randomBytes(4).toString('hex')}@mobile.ekazi.co.ke` : '';
    const email = suppliedEmail || syntheticEmail;

    if (!name || !phone || !password) {
      return res.status(400).json({
        message: 'Name, a valid Kenyan mobile number, and password are required',
      });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    if (suppliedEmail) {
      const emailDuplicate = await pool.query(
        'SELECT 1 FROM users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
        [email],
      );
      if (emailDuplicate.rows.length) {
        return res.status(409).json({ message: 'An account already exists for this email' });
      }
    }

    const phoneUsage = await pool.query(
      'SELECT COUNT(*)::int AS count FROM users WHERE phone = $1 AND deleted_at IS NULL',
      [phone],
    );
    if (Number(phoneUsage.rows[0]?.count || 0) >= 4) {
      return res.status(409).json({ message: 'This phone number is already linked to 4 Ekazi accounts. Use another number or sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role, phone, email_verified, phone_verified, phone_verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
       RETURNING id, name, email, phone, role, email_verified, phone_verified`,
      [name, email, passwordHash, databaseRole, phone, isSyntheticMobileEmail(email)],
    );
    const user = rows[0];
    await ensureHandymanProfile(user);
    let emailConfirmation = { sent: false };
    try {
      emailConfirmation = await sendEmailConfirmation(user);
    } catch (mailError) {
      console.error('email confirmation send error:', mailError);
      emailConfirmation = { sent: false, error: 'send_failed' };
    }

    const phoneVerification = { sent: false, disabled: OTP_AUTH_DISABLED, requiresDeliveryChoice: false, alreadyVerified: true, phone: maskPhone(phone), expiresInMinutes: 10 };

    return res.status(201).json({
      token: createToken(user.id),
      user: publicUser(user),
      emailConfirmation,
      phoneVerification,
    });
  } catch (error) {
    console.error('mobile register error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Account already exists' });
    }
    return res.status(500).json({ message: 'Could not create account' });
  }
};

export const login = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const loginValue = String(req.body?.phone || req.body?.email || '').trim();
    const phone = normalizePhone(loginValue);
    const email = loginValue.toLowerCase();
    const password = String(req.body?.password || '');

    if (!loginValue || !password) {
      return res.status(400).json({ message: 'Phone or email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT id, name, email, phone, password, role, email_verified, phone_verified, profile_completed_at,
              preferred_city, preferred_estate, contact_preference, otp, otp_expiration, otp_resend_count, otp_last_sent_at
         FROM users
        WHERE (($1::text IS NOT NULL AND phone = $1) OR LOWER(email) = $2)
          AND deleted_at IS NULL
        LIMIT 1`,
      [phone, email],
    );
    const user = rows[0];
    const valid = user?.password && (await bcrypt.compare(password, user.password));
    if (!valid) return res.status(401).json({ message: 'Invalid credentials' });

    const challenge = await startTwoFactorChallenge(user, 'login');
    if (challenge.requiresPhone) return res.status(409).json(challenge);
    return res.json(challenge);
  } catch (error) {
    console.error('mobile login error:', error);
    return res.status(500).json({ message: 'Could not sign in' });
  }
};

export const googleAuth = async (req, res) => {
  const requestId = googleAuthRequestId();
  res.setHeader('x-ekazi-google-auth-request-id', requestId);
  try {
    await ensureMobileAuthSchema();
    const idToken = String(req.body?.idToken || req.body?.token || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const accountType = req.body?.role === 'handyman' ? 'handyman' : 'client';
    const databaseRole = accountType === 'handyman' ? 'tutor' : 'student';

    logGoogleAuth(requestId, 'request:start', {
      role: accountType,
      databaseRole,
      phoneSupplied: Boolean(phone),
      token: summarizeIncomingGoogleToken(idToken),
      acceptedAudienceCount: GOOGLE_AUDIENCES.length,
    });

    if (!idToken) {
      logGoogleAuth(requestId, 'request:missing_token');
      return res.status(400).json({ message: 'Google token is required', code: 'GOOGLE_TOKEN_MISSING', requestId });
    }

    let payload;
    try {
      payload = await verifyGoogleIdToken(idToken);
      logGoogleAuth(requestId, 'token:verify_ok', {
        aud: payload?.aud,
        azp: payload?.azp,
        iss: payload?.iss,
        emailDomain: googleEmailDomain(payload?.email),
        emailVerified: payload?.email_verified,
      });
    } catch (verifyError) {
      logGoogleAuth(requestId, 'token:verify_error', {
        name: verifyError?.name,
        message: verifyError?.message,
        code: verifyError?.code,
      });
      throw verifyError;
    }
    if (!payload) {
      logGoogleAuth(requestId, 'token:empty_payload');
      return res.status(401).json({ message: 'Invalid Google sign-in token', code: 'GOOGLE_TOKEN_INVALID', requestId });
    }

    const email = String(payload.email).trim().toLowerCase();
    const name = String(payload.name || payload.given_name || email.split('@')[0]).trim();
    const googleId = String(payload.sub);

    logGoogleAuth(requestId, 'user:lookup_start', { emailDomain: googleEmailDomain(email), googleIdSuffix: googleId.slice(-6) });

    const existing = await pool.query(
      `SELECT id, name, email, phone, role, google_id
         FROM users
        WHERE google_id = $1 OR LOWER(email) = $2
        LIMIT 1`,
      [googleId, email],
    );

    logGoogleAuth(requestId, 'user:lookup_ok', { existingCount: existing.rows.length });

    let user;
    if (existing.rows.length) {
      const result = await pool.query(
        `UPDATE users
            SET google_id = COALESCE(google_id, $2),
                name = CASE WHEN name IS NULL OR name = '' OR name = 'Ekazi User' THEN $3 ELSE name END,
                phone = COALESCE(phone, $4),
                role = COALESCE(role, $5),
                email_verified = TRUE,
                email_verified_at = COALESCE(email_verified_at, NOW()),
                phone_verified = CASE WHEN COALESCE(phone, $4) IS NOT NULL THEN TRUE ELSE phone_verified END,
                phone_verified_at = CASE WHEN COALESCE(phone, $4) IS NOT NULL THEN COALESCE(phone_verified_at, NOW()) ELSE phone_verified_at END
          WHERE id = $1
          RETURNING id, name, email, phone, role, email_verified, phone_verified`,
        [existing.rows[0].id, googleId, name, phone, existing.rows[0].role || databaseRole],
      );
      user = result.rows[0];
      logGoogleAuth(requestId, 'user:linked_existing', { userId: user.id, role: user.role });
    } else {
      const result = await pool.query(
        `INSERT INTO users (name, email, google_id, role, phone, email_verified, email_verified_at, phone_verified, phone_verified_at)
         VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), CASE WHEN $5::text IS NOT NULL THEN TRUE ELSE FALSE END, CASE WHEN $5::text IS NOT NULL THEN NOW() ELSE NULL END)
         RETURNING id, name, email, phone, role, email_verified, phone_verified`,
        [name, email, googleId, databaseRole, phone],
      );
      user = result.rows[0];
      logGoogleAuth(requestId, 'user:created', { userId: user.id, role: user.role });
    }

    await ensureHandymanProfile(user);
    if (!user.phone) {
      logGoogleAuth(requestId, 'response:phone_required_after_google', { userId: user.id, role: user.role });
      return res.json({
        token: createToken(user.id),
        user: publicUser(user),
        requiresPhone: true,
        profileComplete: false,
        profileRequiredActions: ['phone'],
        message: 'Add your Kenyan phone number to complete your Ekazi account.',
        requestId,
      });
    }
    const challenge = await startTwoFactorChallenge(user, 'login');
    logGoogleAuth(requestId, 'response:2fa_required', { userId: user.id, role: user.role, hasPhone: Boolean(user.phone) });
    return res.json({ ...challenge, requestId });
  } catch (error) {
    logGoogleAuth(requestId, 'response:error', {
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: process.env.NODE_ENV === 'production' ? undefined : error?.stack,
    });
    console.error('mobile google auth error:', error);
    if (error?.code === '23505') {
      return res.status(409).json({ message: 'Phone or Google account is already linked', code: 'GOOGLE_ACCOUNT_CONFLICT', requestId });
    }
    return res.status(401).json({ message: 'Could not verify Google account', code: 'GOOGLE_AUTH_FAILED', requestId });
  }
};


export const confirmEmail = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const token = String(req.query?.token || req.body?.token || '').trim();
    if (!token) {
      return res.status(400).json({ ok: false, message: 'Missing confirmation token' });
    }
    const tokenHash = hashEmailToken(token);
    const { rows } = await pool.query(
      `UPDATE users
          SET email_verified = TRUE,
              email_verified_at = NOW(),
              email_verification_token_hash = NULL,
              email_verification_expires_at = NULL
        WHERE email_verification_token_hash = $1
          AND email_verification_expires_at > NOW()
        RETURNING id, name, email, phone, role, email_verified, phone_verified`,
      [tokenHash],
    );
    if (!rows.length) {
      return res.status(400).json({ ok: false, message: 'Invalid or expired confirmation link' });
    }
    const wantsHtml = String(req.get?.('accept') || '').includes('text/html') || req.method === 'GET';
    if (wantsHtml) {
      return res
        .status(200)
        .send('<!doctype html><html><body style="font-family:Arial;padding:32px"><h1>Email confirmed</h1><p>Your Ekazi email has been confirmed. You can return to the app.</p></body></html>');
    }
    return res.json({ ok: true, user: publicUser(rows[0]) });
  } catch (error) {
    console.error('confirm email error:', error);
    return res.status(500).json({ ok: false, message: 'Could not confirm email' });
  }
};

export const resendEmailConfirmation = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, role, email_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference FROM users WHERE id = $1',
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.email_verified) {
      return res.json({ ok: true, alreadyVerified: true, user: publicUser(user) });
    }
    const emailConfirmation = await sendEmailConfirmation(user);
    return res.json({ ok: true, emailConfirmation });
  } catch (error) {
    console.error('resend email confirmation error:', error);
    return res.status(500).json({ message: 'Could not send confirmation email' });
  }
};

export const requestOtp = async (req, res) => {
  if (OTP_AUTH_DISABLED) return res.status(503).json({ ok: false, disabled: true, message: 'OTP verification is temporarily disabled.' });
  try {
    await ensureMobileAuthSchema();
    const phone = normalizePhone(req.body?.phone);
    const purpose = String(req.body?.purpose || 'phone_verification');
    const deliveryMethod = normalizeOtpDeliveryMethod(req.body?.deliveryMethod || req.body?.method);
    const requestedUserId = Number(req.body?.userId || 0);
    const twoFactor = verifyTwoFactorToken(req.body?.twoFactorToken || req.body?.challengeToken);
    const targetUserId = purpose === 'login' && twoFactor ? Number(twoFactor.id) : requestedUserId;
    if (!phone) return res.status(400).json({ message: 'A valid Kenyan mobile number is required' });
    if (purpose === 'login' && (!twoFactor || String(twoFactor.phone) !== phone)) {
      return res.status(401).json({ message: 'Your secure login challenge expired. Sign in again.' });
    }

    const { rows } = targetUserId > 0
      ? await pool.query(
        `SELECT id, name, email, phone_verified, otp, otp_expiration, otp_resend_count, otp_last_sent_at FROM users WHERE id = $1 AND phone = $2 AND deleted_at IS NULL LIMIT 1`,
        [targetUserId, phone],
      )
      : await pool.query(
        `SELECT id, name, email, phone_verified, otp, otp_expiration, otp_resend_count, otp_last_sent_at FROM users WHERE phone = $1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [phone],
      );
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'Create an account before verifying this phone number.' });
    if (purpose === 'phone_verification' && user.phone_verified) {
      return res.json({ ok: true, alreadyVerified: true, phone: maskPhone(phone) });
    }

    const result = await sendOrResendOtp({ user, phone, purpose, initial: !user.otp_last_sent_at, deliveryMethod });
    return res.json(result);
  } catch (error) {
    console.error('[auth][otp_request] error:', error);
    if (error?.code === 'SMS_AUTH_INVALID') {
      return res.status(502).json({ message: 'SMS provider authentication failed. Check AT_USERNAME and AT_API_KEY on the backend.' });
    }
    return res.status(500).json({ message: hasSmsConfig() ? 'Could not send verification SMS' : 'SMS is not configured on the backend' });
  }
};

export const verifyOtp = async (req, res) => {
  if (OTP_AUTH_DISABLED) return res.status(503).json({ ok: false, disabled: true, message: 'OTP verification is temporarily disabled.' });
  try {
    await ensureMobileAuthSchema();
    const phone = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || '').trim();
    const purpose = String(req.body?.purpose || 'phone_verification');
    const twoFactor = verifyTwoFactorToken(req.body?.twoFactorToken || req.body?.challengeToken);
    const requestedUserId = Number(req.body?.userId || 0);
    const targetUserId = purpose === 'login' && twoFactor ? Number(twoFactor.id) : requestedUserId;
    if (!phone || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter the 6-digit verification code.' });
    }
    if (purpose === 'login' && (!twoFactor || String(twoFactor.phone) !== phone)) {
      return res.status(401).json({ message: 'Your secure login challenge expired. Sign in again.' });
    }

    const { rows } = await pool.query(
      `UPDATE users
          SET phone_verified = TRUE,
              phone_verified_at = NOW(),
              otp = NULL,
              otp_expiration = NULL,
              otp_resend_count = 0,
              otp_last_sent_at = NULL,
              otp_email_sent_at = NULL
        WHERE phone = $1
          AND otp = $2
          AND ($3::bigint IS NULL OR id = $3)
          AND otp_expiration > NOW()
          AND deleted_at IS NULL
        RETURNING id, name, email, phone, role, email_verified, phone_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference`,
      [phone, code, targetUserId > 0 ? targetUserId : null],
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ message: 'Invalid or expired verification code' });
    if (purpose === 'login' && Number(twoFactor.id) !== Number(user.id)) {
      return res.status(401).json({ message: 'Your secure login challenge expired. Sign in again.' });
    }
    return res.json({ token: createToken(user.id), user: publicUser(user), phoneVerified: true, twoFactorVerified: purpose === 'login' });
  } catch (error) {
    console.error('mobile OTP verification error:', error);
    return res.status(500).json({ message: 'Could not verify phone number' });
  }
};

export const requestPasswordOtp = async (req, res) => {
  if (OTP_AUTH_DISABLED) return res.status(503).json({ ok: false, disabled: true, message: 'Password reset by OTP is temporarily disabled.' });
  try {
    await ensureMobileAuthSchema();
    const phone = normalizePhone(req.body?.phone || req.body?.email);
    const deliveryMethod = normalizeOtpDeliveryMethod(req.body?.deliveryMethod || req.body?.method);
    if (!phone) return res.status(400).json({ message: 'Enter your registered Kenyan phone number.' });
    const { rows } = await pool.query('SELECT id, name, email, otp, otp_expiration, otp_resend_count, otp_last_sent_at FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1', [phone]);
    const user = rows[0];
    if (!user) return res.status(404).json({ message: 'No Ekazi account uses this phone number.' });
    const result = await sendOrResendOtp({ user, phone, purpose: 'password_reset', initial: !user.otp_last_sent_at, deliveryMethod });
    return res.json(result);
  } catch (error) {
    console.error('[auth][password_otp_request] error:', error);
    if (error?.code === 'SMS_AUTH_INVALID') {
      return res.status(502).json({ message: 'SMS provider authentication failed. Check AT_USERNAME and AT_API_KEY on the backend.' });
    }
    return res.status(500).json({ message: hasSmsConfig() ? 'Could not send password reset SMS' : 'SMS is not configured on the backend' });
  }
};

export const resetPasswordWithOtp = async (req, res) => {
  if (OTP_AUTH_DISABLED) return res.status(503).json({ ok: false, disabled: true, message: 'Password reset by OTP is temporarily disabled.' });
  try {
    await ensureMobileAuthSchema();
    const phone = normalizePhone(req.body?.phone || req.body?.email);
    const code = String(req.body?.code || req.body?.otp || '').trim();
    const newPassword = String(req.body?.newPassword || req.body?.password || '');
    if (!phone || !/^\d{6}$/.test(code) || newPassword.length < 8) {
      return res.status(400).json({ message: 'Phone, valid OTP and a password of at least 8 characters are required.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    const { rows } = await pool.query(
      `UPDATE users
          SET password = $3,
              must_change_password = FALSE,
              otp = NULL,
              otp_expiration = NULL,
              otp_resend_count = 0,
              otp_last_sent_at = NULL,
              otp_email_sent_at = NULL,
              updated_at = NOW()
        WHERE phone = $1
          AND otp = $2
          AND otp_expiration > NOW()
          AND deleted_at IS NULL
        RETURNING id, name, email, phone, role, email_verified, phone_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference`,
      [phone, code, hash],
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ message: 'Invalid or expired password reset code' });
    return res.json({ ok: true, token: createToken(user.id), user: publicUser(user) });
  } catch (error) {
    console.error('[auth][password_otp_reset] error:', error);
    return res.status(500).json({ message: 'Could not reset password' });
  }
};

export const me = async (req, res) => {
  try {
    await ensureMobileAuthSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const { rows } = await pool.query(
      'SELECT id, name, email, phone, role, email_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference FROM users WHERE id = $1',
      [userId],
    );
    if (!rows.length) return res.status(401).json({ message: 'User no longer exists' });
    const user = rows[0];
    return res.json({
      user: publicUser(user),
      profileComplete: isProfileComplete(user),
      profileRequiredActions: profileRequirements(user),
    });
  } catch (error) {
    console.error('mobile me error:', error);
    return res.status(500).json({ message: 'Could not load account' });
  }
};


export const completeProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    await ensureMobileAuthSchema();
    await ensureMarketplaceSchema();
    const userId = Number(req.user?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(401).json({ message: 'Invalid user session' });
    }
    const name = String(req.body?.name || '').trim();
    const phone = normalizePhone(req.body?.phone);
    const city = String(req.body?.city || 'Nairobi').trim().slice(0, 80);
    const estate = String(req.body?.estate || '').trim().slice(0, 120);
    const emergencyContact = normalizePhone(req.body?.emergencyContact) || null;
    const contactPreference = ['phone', 'whatsapp', 'sms'].includes(String(req.body?.contactPreference || '').toLowerCase())
      ? String(req.body.contactPreference).toLowerCase()
      : 'phone';
    if (name.length < 2) return res.status(400).json({ message: 'Enter your full name.' });
    if (!phone) return res.status(400).json({ message: 'Enter a valid Kenyan phone number.' });

    await client.query('BEGIN');
    const currentResult = await client.query('SELECT id, role, phone, phone_verified FROM users WHERE id = $1 FOR UPDATE', [userId]);
    const current = currentResult.rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'User not found' });
    }
    const phoneUsage = await client.query(
      'SELECT COUNT(*)::int AS count FROM users WHERE phone = $1 AND id <> $2 AND deleted_at IS NULL',
      [phone, userId],
    );
    if (Number(phoneUsage.rows[0]?.count || 0) >= 4) {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'This phone number is already linked to 4 Ekazi accounts. Use another number.' });
    }

    const userResult = await client.query(
      `UPDATE users
          SET name = $2,
              phone = $3,
              preferred_city = $4,
              preferred_estate = $5,
              emergency_contact = $6,
              contact_preference = $7,
              phone_verified = TRUE,
              phone_verified_at = COALESCE(phone_verified_at, NOW()),
              profile_completed_at = NOW()
        WHERE id = $1
        RETURNING id, name, email, phone, role, email_verified, phone_verified, profile_completed_at, preferred_city, preferred_estate, contact_preference`,
      [userId, name, phone, city, estate || null, emergencyContact, contactPreference],
    );
    const user = userResult.rows[0];

    if (current.role === 'tutor') {
      const businessName = String(req.body?.businessName || name).trim().slice(0, 120);
      const bio = String(req.body?.bio || '').trim().slice(0, 600);
      const categories = normalizeProviderServices(req.body?.categories);
      const radius = Number(req.body?.serviceRadiusKm || 20);
      if (!businessName) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Business name is required for providers.' });
      }
      if (!categories.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Select at least one service category.' });
      }
      const serviceLimit = await validateProviderServiceSelection(client, userId, categories);
      if (!serviceLimit.ok) {
        await client.query('ROLLBACK');
        return res.status(serviceLimit.status || 409).json(providerServiceLimitError(serviceLimit));
      }
      await client.query(
        `INSERT INTO ekazi_handyman_profiles
           (user_id, business_name, categories, estate, city, service_radius_km, bio, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           business_name = EXCLUDED.business_name,
           categories = EXCLUDED.categories,
           estate = EXCLUDED.estate,
           city = EXCLUDED.city,
           service_radius_km = EXCLUDED.service_radius_km,
           bio = EXCLUDED.bio,
           updated_at = NOW()`,
        [userId, businessName, categories, estate || null, city, Number.isFinite(radius) && radius > 0 ? radius : 20, bio || null],
      );
    }

    await client.query('COMMIT');
    const publicProfile = publicUser(user);
    const phoneVerification = {
      sent: false,
      disabled: OTP_AUTH_DISABLED,
      requiresDeliveryChoice: false,
      deliveryMethods: [],
      phone: maskPhone(phone),
      alreadyVerified: true,
      expiresInMinutes: 10,
    };
    return res.json({
      ok: true,
      user: publicProfile,
      phoneVerification,
      profileComplete: publicProfile.profileComplete,
      profileRequiredActions: publicProfile.profileRequiredActions,
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('complete profile error:', error);
    return res.status(500).json({ message: 'Could not save profile details' });
  } finally {
    client.release();
  }
};
