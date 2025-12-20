// controllers/paystackController.js
import fetch from 'node-fetch';
import crypto from 'crypto';
import pool from '../config/db.js';
import { verifyAndFinalize as verifyAndFinalizeHandler } from './paystackVerifyController.js';
import { verifyAndFinalizeOrg } from './orgPaystackVerifyController.js';

const FEE_PCT = Number(process.env.PAYMENT_GATEWAY_PERCENT ?? 0);
const FEE_FIXED = Number(process.env.PAYMENT_GATEWAY_FIXED ?? 0.3);
const FX_USD_TO_GATEWAY = Number(
  process.env.PAYSTACK_USD_TO_GATEWAY_RATE || 130,
); // 1 USD = 130 KES

const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
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

if (!PAYSTACK_SECRET_KEY)
  throw new Error('[paystack] Missing PAYSTACK_SECRET_KEY');

// HARD GUARD: your Paystack account currency is KES
if (PAYSTACK_CURRENCY !== 'KES') {
  throw new Error(
    `[paystack] PAYSTACK_CURRENCY must be KES, got ${PAYSTACK_CURRENCY}`,
  );
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
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
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
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
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
    const kind = String(md.kind || '').toLowerCase(); // 'org' | 'tokens'

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
