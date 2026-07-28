// controllers/paystackController.js
import fetch from 'node-fetch';
import crypto from 'crypto';
import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';
import { verifyAndFinalize as verifyAndFinalizeHandler } from './paystackVerifyController.js';
import { verifyAndFinalizeOrg } from './orgPaystackVerifyController.js';

const FEE_PCT = Number(process.env.PAYMENT_GATEWAY_PERCENT ?? 0);
const FEE_FIXED = Number(process.env.PAYMENT_GATEWAY_FIXED ?? 0.3);
const FX_USD_TO_GATEWAY = Number(
  process.env.PAYSTACK_USD_TO_GATEWAY_RATE || 130,
); // 1 USD = 130 KES

function getPaystackSecret() {
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}
const PAYSTACK_BASE = 'https://api.paystack.co';
const PAYSTACK_CURRENCY = (
  process.env.PAYSTACK_CURRENCY || 'KES'
).toUpperCase();

const PAYSTACK_CALLBACK_URL_WEB = (
  process.env.PAYSTACK_CALLBACK_URL_WEB ||
  process.env.PAYSTACK_CALLBACK_URL || // backward compat
  ''
).trim();

const PAYSTACK_CALLBACK_URL_NATIVE = (
  process.env.PAYSTACK_CALLBACK_URL_NATIVE || ''
).trim();

function inferClientPlatform(req) {
  const hinted =
    String(
      req?.get?.('x-client-platform') || req?.get?.('x-platform') || '',
    ).toLowerCase() ||
    String(req?.query?.platform || req?.body?.platform || '').toLowerCase();

  if (['native', 'mobile', 'expo', 'android', 'ios'].includes(hinted))
    return 'native';
  if (['web', 'browser'].includes(hinted)) return 'web';

  const ua = String(req?.get?.('user-agent') || '');
  if (/okhttp|dalvik|android|iphone|ipad|ios|expo|reactnative/i.test(ua))
    return 'native';

  return 'web';
}

function resolvePaystackCallbackBase(req) {
  const platform = inferClientPlatform(req);

  if (platform === 'native' && PAYSTACK_CALLBACK_URL_NATIVE)
    return PAYSTACK_CALLBACK_URL_NATIVE;
  if (platform === 'web' && PAYSTACK_CALLBACK_URL_WEB)
    return PAYSTACK_CALLBACK_URL_WEB;

  return PAYSTACK_CALLBACK_URL_WEB || PAYSTACK_CALLBACK_URL_NATIVE || '';
}

function getPaystackConfigError() {
  if (!getPaystackSecret()) return 'PAYSTACK_SECRET_KEY is not configured';
  if (PAYSTACK_CURRENCY !== 'KES') return `PAYSTACK_CURRENCY must be KES, got ${PAYSTACK_CURRENCY}`;
  return null;
}

function paystackUnavailable(res, detail) {
  return res.status(503).json({
    message: 'paystack-not-configured',
    detail,
  });
}

function buildCallbackUrl(req, base, params = {}) {
  // base should be something like: http://localhost:5173/paystack/callback
  // or: https://yourdomain.com/paystack/callback
  const fallbackBase =
    resolvePaystackCallbackBase(req) ||
    process.env.WEB_URL ||
    process.env.FRONTEND_URL ||
    req?.get?.('origin') ||
    `${req.protocol}://${req.get('host')}/paystack/callback`;

  const finalBase =
    base && String(base).trim() ? String(base).trim() : fallbackBase;

  // Ensure it ends with the callback path (optional safety)
  const u = new URL(finalBase);

  // If you passed only domain in env, you can force the path:
  // u.pathname = '/paystack/callback';

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    u.searchParams.set(k, String(v));
  }

  return u.toString();
}

async function verifyPaystackReference(reference) {
  const paystackSecret = getPaystackSecret();
  const r = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${paystackSecret}` },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.status) {
    const err = new Error(j?.message || `Paystack verify failed: ${r.status}`);
    err.statusCode = 502;
    err.provider = 'paystack';
    err.http = r.status;
    throw err;
  }
  return j;
}

/* ----------------------- shared helpers ----------------------- */

async function recordPaymentFees(
  paymentId,
  amountCapturedUsd,
  explicit = null,
) {
  const fee_fixed_usd = explicit?.fixedUsd ?? FEE_FIXED;
  const fee_percent = explicit?.percent ?? FEE_PCT;
  const fee_total_usd =
    explicit?.totalUsd ??
    Math.round(
      (Number(amountCapturedUsd || 0) * fee_percent + fee_fixed_usd) * 100,
    ) / 100;

  await pool.query(
    `UPDATE payments
        SET fee_fixed_usd = $1,
            fee_percent   = $2,
            fee_total_usd = $3,
            updated_at    = NOW()
      WHERE id = $4`,
    [fee_fixed_usd, fee_percent, fee_total_usd, paymentId],
  );
}

async function getPackageById(packageId) {
  const { rows } = await pool.query(
    'SELECT id, credits, price, currency, offer FROM packages WHERE id = $1',
    [packageId],
  );
  if (!rows[0]) throw new Error(`Unknown packageId: ${packageId}`);
  return rows[0];
}

async function creditTokensAndCompletePayment(
  client,
  { paymentId, userId, packageId },
) {
  const pkgRes = await client.query(
    'SELECT credits FROM packages WHERE id = $1',
    [packageId],
  );
  if (!pkgRes.rows[0]) throw new Error('Package not found while crediting');
  const credits = Number(pkgRes.rows[0].credits);

  const userRes = await client.query(
    'UPDATE users SET tokens = tokens + $1 WHERE id = $2 RETURNING tokens',
    [credits, userId],
  );
  if (!userRes.rows[0]) throw new Error('User not found while crediting');

  await client.query(
    "UPDATE payments SET status = 'Completed', updated_at = NOW() WHERE id = $1 AND status <> 'Completed'",
    [paymentId],
  );

  return { tokens: userRes.rows[0].tokens, credits };
}

function toMinorUnits(amountStr) {
  const n = Number(amountStr);
  if (Number.isNaN(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

function usdToGatewayMinor(amountUsdStr) {
  const usd = Number(amountUsdStr);
  if (Number.isNaN(usd)) throw new Error('Invalid USD amount');

  // For this project: Paystack currency is KES always.
  const fx = FX_USD_TO_GATEWAY;
  const gatewayAmount = usd * fx;

  // trimmed log
  console.log('[paystack][fx]', { fx, currency: PAYSTACK_CURRENCY });

  return Math.round(gatewayAmount * 100);
}

/* --------------------- create Paystack "order" (hosted page) --------------------- */
// POST /api/paystack/create-order
export async function createOrder(req, res) {
  try {
    const configError = getPaystackConfigError();
    if (configError) return paystackUnavailable(res, configError);
    const paystackSecret = getPaystackSecret();
    const userId = req?.user?.id;
    if (!userId)
      return res
        .status(401)
        .json({ message: 'Unauthorized: User not authenticated' });

    const { packageId } = req.body || {};
    if (!packageId)
      return res.status(400).json({ message: 'missing packageId' });

    const pkg = await getPackageById(packageId);

    // UI shows USD packages for CARD, but Paystack charges KES
    if ((pkg.currency || '').toUpperCase() !== 'USD') {
      return res.status(400).json({
        message: 'Package currency must be USD for Paystack card checkout',
      });
    }

    const amountUSD = Number(pkg.price).toFixed(2);

    // Need buyer email for Paystack
    const { rows: userRows } = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    const user = userRows[0];
    if (!user?.email)
      return res.status(400).json({ message: 'User email not found' });

    // (1) Create pending payments row (INTENT stays USD)
    const { rows } = await pool.query(
      `INSERT INTO payments (user_id, package_id, payment_method, status, amount, currency, provider)
       VALUES ($1, $2, 'PAYSTACK', 'Pending', $3, 'USD', 'PAYSTACK')
       RETURNING id`,
      [userId, pkg.id, amountUSD],
    );
    const paymentRow = rows[0];

    // (2) Generate reference tied to this payment
    const reference = `ps_${paymentRow.id}_${Date.now()}`;

    // (3) Compute expected KES amount and persist into meta (FX audit)
    const amountMinor = usdToGatewayMinor(amountUSD);
    const amountKesMajor = (amountMinor / 100).toFixed(2);

    await pool.query(
      `UPDATE payments
      SET transaction_id = $1,
          meta = COALESCE(meta,'{}'::jsonb) ||
                jsonb_build_object(
                  'intentCurrency', 'USD',
                  'intentAmountUsd', to_jsonb(($2)::numeric),
                  'chargeCurrency', 'KES',
                  'chargeAmountKes', to_jsonb(($3)::numeric),
                  'chargeAmountMinor', to_jsonb(($4)::int),
                  'fxUsdToKes', to_jsonb(($5)::numeric)
                ),
          updated_at = NOW()
    WHERE id = $6`,
      [
        reference,
        amountUSD,
        amountKesMajor,
        amountMinor,
        FX_USD_TO_GATEWAY,
        paymentRow.id,
      ],
    );

    // (4) Initialize Paystack transaction (KES minor units)
    const psBody = {
      email: user.email,
      amount: amountMinor,
      currency: 'KES',
      reference,
      callback_url: buildCallbackUrl(req, resolvePaystackCallbackBase(req), {
        kind: 'tokens',
      }),
      channels: ['card'],

      metadata: {
        kind: 'tokens',
        paymentId: paymentRow.id,
        userId,
        packageId: pkg.id,
        usdPrice: amountUSD,
        fxUsdToKes: FX_USD_TO_GATEWAY,
        expectedKesMinor: amountMinor,
        expectedKesMajor: amountKesMajor,
      },
    };

    const r = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(psBody),
    });

    const j = await r.json().catch(() => null);

    if (!r.ok || !j?.status) {
      // trimmed logging
      console.error('[paystack][create-order] init failed', {
        http: r.status,
        message: j?.message,
      });
      return res.status(500).json({
        message: 'paystack-init-failed',
        providerMessage: j?.message,
      });
    }

    return res.json({
      paymentId: paymentRow.id,
      reference: j.data.reference,
      authorization_url: j.data.authorization_url,
      access_code: j.data.access_code,
      priceUsd: amountUSD,
      expectedKes: amountKesMajor,
      credits: pkg.credits,
      offer: pkg.offer,
    });
  } catch (e) {
    console.error('[paystack][create-order] ERROR', { message: e?.message });
    return res
      .status(500)
      .json({ message: 'create-order-failed', error: e?.message || 'unknown' });
  }
}

/* --------------------- create booking Paystack checkout --------------------- */
// POST /api/paystack/create-booking-order
export async function createBookingOrder(req, res) {
  try {
    const configError = getPaystackConfigError();
    if (configError) return paystackUnavailable(res, configError);
    const paystackSecret = getPaystackSecret();
    await ensureMarketplaceSchema();
    await pool.query('ALTER TABLE payments ALTER COLUMN package_id DROP NOT NULL').catch((error) => {
      console.warn('[paystack][booking] package_id nullable migration skipped', error?.message || error);
    });

    const userId = req?.user?.id;
    if (!userId) return res.status(401).json({ message: 'Unauthorized: User not authenticated' });

    const bookingId = Number(req.body?.bookingId || req.body?.booking_id);
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ message: 'A valid bookingId is required' });
    }

    const { rows } = await pool.query(
      `SELECT b.*, j.id AS job_id, q.id AS quote_id, u.email AS client_email, u.name AS client_name
         FROM ekazi_bookings b
         JOIN ekazi_jobs j ON j.id = b.job_id
         JOIN ekazi_quotes q ON q.id = b.quote_id
         JOIN users u ON u.id = b.client_user_id
        WHERE b.id = $1 AND b.client_user_id = $2
        LIMIT 1`,
      [bookingId, userId],
    );
    const booking = rows[0];
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (String(booking.payment_method || '').toLowerCase() !== 'card') {
      return res.status(409).json({ message: 'This booking is not marked for card payment.' });
    }
    if (String(booking.payment_status || '').toLowerCase() === 'platform_collected') {
      return res.status(409).json({ message: 'This booking has already been paid.' });
    }
    if (!booking.client_email) {
      return res.status(400).json({ message: 'Add an email address before paying by card.' });
    }

    const total = Math.max(1, Number(booking.total || 0));
    const amountMinor = Math.round(total * 100);

    const paymentRow = await pool.query(
      `INSERT INTO payments (user_id, package_id, payment_method, status, amount, currency, provider, meta)
       VALUES ($1, NULL, 'PAYSTACK', 'Pending', $2, 'KES', 'PAYSTACK',
               jsonb_build_object('kind','booking','bookingId',$3::int,'jobId',$4::int,'quoteId',$5::int,'chargeCurrency','KES','chargeAmountKes',$2::numeric,'chargeAmountMinor',$6::int))
       RETURNING id`,
      [userId, total.toFixed(2), booking.id, booking.job_id, booking.quote_id, amountMinor],
    );
    const paymentId = paymentRow.rows[0].id;
    const reference = `ps_booking_${booking.id}_${paymentId}_${Date.now()}`;

    await pool.query(
      `UPDATE payments
          SET transaction_id = $1,
              meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('reference',$1::text)
        WHERE id = $2`,
      [reference, paymentId],
    );

    await pool.query(
      `UPDATE ekazi_bookings
          SET payment_status = 'pending_card_payment'
        WHERE id = $1 AND payment_status <> 'platform_collected'`,
      [booking.id],
    );

    const psBody = {
      email: booking.client_email,
      amount: amountMinor,
      currency: 'KES',
      reference,
      callback_url: buildCallbackUrl(req, resolvePaystackCallbackBase(req), {
        kind: 'booking',
        bookingId: booking.id,
        jobId: booking.job_id,
        quoteId: booking.quote_id,
        paymentId,
      }),
      channels: ['card'],
      metadata: {
        kind: 'booking',
        paymentId,
        bookingId: booking.id,
        jobId: booking.job_id,
        quoteId: booking.quote_id,
        userId,
        expectedKesMinor: amountMinor,
        expectedKesMajor: total.toFixed(2),
      },
    };

    const r = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(psBody),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.status) {
      console.error('[paystack][create-booking-order] init failed', { http: r.status, message: j?.message });
      return res.status(500).json({ message: 'paystack-init-failed', providerMessage: j?.message });
    }

    return res.json({
      paymentId,
      bookingId: String(booking.id),
      jobId: String(booking.job_id),
      quoteId: String(booking.quote_id),
      reference: j.data.reference,
      authorization_url: j.data.authorization_url,
      access_code: j.data.access_code,
      amountKes: total.toFixed(2),
    });
  } catch (e) {
    console.error('[paystack][create-booking-order] ERROR', { message: e?.message });
    return res.status(500).json({ message: 'create-booking-order-failed', error: e?.message || 'unknown' });
  }
}

export async function verifyBookingPaymentByReference(reference) {
  const configError = getPaystackConfigError();
  if (configError) {
    const err = new Error(configError);
    err.statusCode = 503;
    throw err;
  }
  await ensureMarketplaceSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lock = await client.query(
      `SELECT p.id, p.user_id, p.status, p.amount, p.currency, p.meta, b.id AS booking_id, b.job_id, b.quote_id, b.client_user_id, b.payment_status
         FROM payments p
         JOIN ekazi_bookings b ON b.id = ((p.meta->>'bookingId')::bigint)
        WHERE p.transaction_id = $1
          AND (p.meta->>'kind') = 'booking'
        ORDER BY p.id DESC
        LIMIT 1
        FOR UPDATE`,
      [reference],
    );
    const row = lock.rows[0];
    if (!row) {
      await client.query('ROLLBACK');
      return { ok: false, status: 'failed', message: 'booking-payment-not-found', reference };
    }
    if (String(row.status).toLowerCase() === 'completed' && row.payment_status === 'platform_collected') {
      await client.query('COMMIT');
      return { ok: true, status: 'success', alreadyCompleted: true, reference, bookingId: String(row.booking_id), jobId: String(row.job_id), quoteId: String(row.quote_id) };
    }

    const verified = await verifyPaystackReference(reference);
    const data = verified?.data;
    const payStatus = String(data?.status || 'pending').toLowerCase();
    if (!data || payStatus !== 'success') {
      await client.query('COMMIT');
      return { ok: false, status: payStatus || 'pending', message: 'not-success-yet', reference };
    }

    const currency = String(data.currency || '').toUpperCase();
    const expectedMinor = Number(row.meta?.chargeAmountMinor || row.meta?.expectedKesMinor || Math.round(Number(row.amount || 0) * 100));
    const paidMinor = typeof data.amount === 'number' ? data.amount : null;
    if (currency !== 'KES' || paidMinor !== expectedMinor) {
      await client.query(
        `UPDATE payments
            SET status = 'Failed',
                updated_at = NOW(),
                meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('failReason','booking_payment_mismatch','paidMinor',$1::int,'expectedMinor',$2::int,'currency',$3::text)
          WHERE id = $4`,
        [paidMinor, expectedMinor, currency, row.id],
      );
      await client.query('COMMIT');
      return { ok: false, status: 'failed', message: 'amount-or-currency-mismatch', reference, expectedMinor, paidMinor, currency };
    }

    const providerId = data.id != null ? String(data.id) : null;
    const payerEmail = data.customer?.email || null;
    const feesMinor = typeof data.fees === 'number' ? data.fees : null;
    await client.query(
      `UPDATE payments
          SET status = 'Completed',
              capture_id = COALESCE($2::text, capture_id),
              payer_email = COALESCE($3::text, payer_email),
              fee_total = COALESCE($4::numeric, fee_total),
              fee_currency = CASE WHEN $4 IS NOT NULL THEN 'KES' ELSE fee_currency END,
              meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('paystackStatus','success','capturedAmountMinor',$5::int,'capturedAmountKes',($5::numeric / 100), 'providerId',$2::text),
              updated_at = NOW()
        WHERE id = $1`,
      [row.id, providerId, payerEmail, feesMinor == null ? null : Number((feesMinor / 100).toFixed(2)), paidMinor],
    );
    await client.query(
      `UPDATE ekazi_bookings
          SET payment_status = 'platform_collected',
              provider_settlement_status = CASE WHEN status = 'completed' THEN 'payable' ELSE provider_settlement_status END
        WHERE id = $1`,
      [row.booking_id],
    );
    await client.query('COMMIT');
    return { ok: true, status: 'success', reference, bookingId: String(row.booking_id), jobId: String(row.job_id), quoteId: String(row.quote_id) };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function verifyBookingPayment(req, res) {
  const reference = String(req.params.reference || '').trim();
  if (!reference) return res.status(400).json({ ok: false, status: 'failed', message: 'missing-reference' });
  try {
    const result = await verifyBookingPaymentByReference(reference);
    const status = result.message === 'booking-payment-not-found' ? 404 : 200;
    return res.status(status).json(result);
  } catch (e) {
    console.error('[paystack][verify-booking] ERROR', { reference, message: e?.message });
    return res.status(Number(e?.statusCode) || 500).json({ ok: false, status: 'failed', message: 'verify-booking-failed', reference, error: e?.message || 'unknown' });
  }
}

/* ------------------------ INLINE CARD CHARGE (PCI-risk) ------------------------ */
/**
 * Strong recommendation: disable/remove in production once you’re on hosted checkout.
 * Keeping for compatibility, but with trimmed logs.
 */
export async function cardCharge(req, res) {
  return res.status(410).json({
    message: 'card-charge-disabled',
    detail:
      'Inline card collection is disabled. Use hosted Paystack checkout (/create-order).',
  });
}

export async function submitOtpCharge(req, res) {
  return res.status(410).json({
    message: 'submit-otp-disabled',
    detail:
      'OTP submit for inline card charge is disabled. Use hosted Paystack checkout (/create-order).',
  });
}

/* ------------------------ Paystack webhook (capture) ------------------------ */
export const handlePaystackWebhook = async (req, res) => {
  const sig = req.headers['x-paystack-signature'];
  const raw = req.rawBody ?? req.body;

  try {
    const configError = getPaystackConfigError();
    if (configError) {
      console.warn('[paystack][webhook] skipped:', configError);
      return res.sendStatus(200);
    }
    const hash = crypto
      .createHmac('sha512', getPaystackSecret())
      .update(raw)
      .digest('hex');
    if (!sig || hash !== sig) return res.status(400).send('Invalid signature');

    const event = JSON.parse(raw.toString('utf8'));

    if (event?.event !== 'charge.success') return res.sendStatus(200);

    const reference = event?.data?.reference;
    if (!reference) return res.sendStatus(200);

    const currency = String(event?.data?.currency || '').toUpperCase();
    const providerId = event?.data?.id != null ? String(event.data.id) : null;

    // metadata can be absent sometimes; guard hard
    const md = event?.data?.metadata || {};
    const kind = String(md.kind || '').toLowerCase(); // 'org' | 'tokens' | 'booking'

    console.log('[paystack][webhook] charge.success', {
      reference,
      currency,
      providerId,
      kind,
    });

    // ACK Paystack immediately
    res.sendStatus(200);

    // finalize asynchronously (still in-process, just not blocking the webhook response)
    setImmediate(async () => {
      const fauxReq = { params: { reference } };
      const fauxRes = {
        status: () => fauxRes,
        json: () => null,
        send: () => null,
        sendStatus: () => null,
      };

      try {
        if (kind === 'org') {
          await verifyAndFinalizeOrg(fauxReq, fauxRes);
        } else if (kind === 'booking') {
          await verifyBookingPaymentByReference(reference);
        } else {
          // default to tokens finalizer
          await verifyAndFinalizeHandler(fauxReq, fauxRes);
        }
      } catch (e) {
        console.error('[paystack][webhook] finalize error', {
          reference,
          message: e?.message,
        });
      }
    });
  } catch (e) {
    console.error('[paystack][webhook] handler error', { message: e?.message });
    return res.sendStatus(200); // never fail webhook delivery
  }
};
