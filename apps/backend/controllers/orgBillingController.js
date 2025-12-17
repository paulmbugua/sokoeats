// apps/backend/controllers/orgBillingController.js
import fetch from 'node-fetch';
import pool from '../config/db.js';
import { resolvePrice, ORG_SEATS } from '../services/orgPricing.js';
import { stkPushOrgSubscription } from '../services/mpesaOrgService.js';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';

/* ------------------------------------------------------------------ */
/* Paystack settings (match package purchase pattern)                   */
/* ------------------------------------------------------------------ */
const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const PAYSTACK_BASE = 'https://api.paystack.co';

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
    String(req?.get?.('x-client-platform') || req?.get?.('x-platform') || '').toLowerCase() ||
    String(req?.query?.platform || req?.body?.platform || '').toLowerCase();

  if (['native', 'mobile', 'expo', 'android', 'ios'].includes(hinted)) return 'native';
  if (['web', 'browser'].includes(hinted)) return 'web';

  const ua = String(req?.get?.('user-agent') || '');
  if (/okhttp|dalvik|android|iphone|ipad|ios|expo|reactnative/i.test(ua)) return 'native';

  return 'web';
}

function resolvePaystackCallbackBase(req) {
  const platform = inferClientPlatform(req);

  if (platform === 'native' && PAYSTACK_CALLBACK_URL_NATIVE) return PAYSTACK_CALLBACK_URL_NATIVE;
  if (platform === 'web' && PAYSTACK_CALLBACK_URL_WEB) return PAYSTACK_CALLBACK_URL_WEB;

  // fallback order
  return PAYSTACK_CALLBACK_URL_WEB || PAYSTACK_CALLBACK_URL_NATIVE || '';
}

// e.g. http://localhost:5173/paystack/callback  (or https://www.daybreaklearner.com/paystack/callback)

function buildCallbackUrl(base, params) {
  if (!base) return undefined;
  const u = new URL(base); // must be absolute
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '') return;
    u.searchParams.set(k, String(v));
  });
  return u.toString();
}


// Your Paystack account currency must be KES
const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || 'KES').toUpperCase();
const FX_USD_TO_GATEWAY = Number(process.env.PAYSTACK_USD_TO_GATEWAY_RATE || 130); // 1 USD = 130 KES

if (!PAYSTACK_SECRET_KEY) throw new Error('[paystack] Missing PAYSTACK_SECRET_KEY');
if (PAYSTACK_CURRENCY !== 'KES') {
  throw new Error(`[paystack] PAYSTACK_CURRENCY must be KES, got ${PAYSTACK_CURRENCY}`);
}

function usdCentsToKesMinor(usdCents) {
  const usd = Number(usdCents) / 100;
  if (!Number.isFinite(usd) || usd <= 0) throw new Error('Invalid USD amount');
  const kes = usd * FX_USD_TO_GATEWAY;
  return Math.round(kes * 100); // KES minor units
}

async function paystackInitTransaction({
  email,
  amount_minor, // integer in lowest denom (KES minor)
  reference,
  callback_url,
  metadata,
  channels,
}) {
  const r = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: Math.round(Number(amount_minor)),
      currency: 'KES',
      reference: reference || undefined,
      callback_url: callback_url || undefined,
      channels: Array.isArray(channels) && channels.length ? channels : ['card'],
      metadata: metadata || undefined,
    }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.status !== true) {
    console.error('[paystack][initialize] error', r.status, j?.message);
    throw new Error(j?.message || `paystack initialize failed: ${r.status}`);
  }

  return {
    authorization_url: j?.data?.authorization_url,
    access_code: j?.data?.access_code,
    reference: j?.data?.reference,
  };
}

async function paystackVerify(reference) {
  const ref = String(reference || '').trim();
  if (!ref) throw new Error('Missing paystack reference');

  const r = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(ref)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.status !== true) {
    console.error('[paystack][verify] error', r.status, j?.message);
    throw new Error(j?.message || `paystack verify failed: ${r.status}`);
  }

  const d = j?.data || {};
  return {
    status: d?.status, // 'success' | ...
    reference: d?.reference,
    amount: d?.amount, // integer in lowest denom
    currency: d?.currency,
    transactionId: d?.id,
    paidAt: d?.paid_at || null,
    customerEmail: d?.customer?.email || d?.customer?.email_address || null,
  };
}

/* ------------------------------------------------------------------ */
/* Validation helpers                                                 */
/* ------------------------------------------------------------------ */
function validateOrgSubInit({ tier, cycle, method, phone }) {
  const validTier = ['pro', 'enterprise'];
  const validCycle = ['monthly', 'yearly'];
  const validMethod = ['MPESA', 'PAYSTACK'];

  if (!validTier.includes((tier || '').toLowerCase())) return { ok: false, message: 'Invalid tier' };
  if (!validCycle.includes((cycle || '').toLowerCase())) return { ok: false, message: 'Invalid cycle' };

  const m = (method || '').toUpperCase();
  if (!validMethod.includes(m)) return { ok: false, message: 'Invalid method' };
  if (m === 'MPESA' && !phone) return { ok: false, message: 'Phone required for M-Pesa' };
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Shared: activate subscription once payment is completed             */
/* ------------------------------------------------------------------ */
async function activateOrgSubscriptionTx(client, payRow) {
  const tier = String(payRow.tier || '').toLowerCase();

  const seats = Number(ORG_SEATS?.[tier]);
  if (!Number.isFinite(seats) || seats <= 0) {
    throw new Error(`Missing/invalid seats mapping for tier "${tier}" in ORG_SEATS`);
  }

  // Deactivate any active subscription (history preserved)
  await client.query(
    `UPDATE org_subscriptions
        SET active=FALSE, updated_at=NOW()
      WHERE org_id=$1 AND active=TRUE`,
    [payRow.org_id]
  );

  const start = new Date();
  const expires = new Date(start);
  if (String(payRow.cycle) === 'monthly') expires.setMonth(expires.getMonth() + 1);
  else expires.setFullYear(expires.getFullYear() + 1);

  const currency = String(payRow.currency || 'USD').toUpperCase();
  const amountCents = Number(payRow.amount_cents);

  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error('Invalid amount_cents on payment row');
  }

  const sub = await client.query(
    `INSERT INTO org_subscriptions
      (org_id, tier, cycle, seats, currency, amount_cents, active, started_at, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,TRUE,$7,$8)
     RETURNING *`,
    [payRow.org_id, tier, String(payRow.cycle), seats, currency, amountCents, start, expires]
  );

  await client.query(`UPDATE organizations SET updated_at=NOW() WHERE id=$1`, [payRow.org_id]);

  return sub.rows[0];
}


/* ------------------------------------------------------------------ */
/* POST /api/orgs/:orgId/subscribe/init                               */
/* Body: { tier, cycle, method: 'MPESA'|'PAYSTACK', phone? }          */
/* ------------------------------------------------------------------ */
export async function initOrgSubscription(req, res) {
  const userId = req.user?.id;
  const userEmailFromAuth = req.user?.email || null;
  const { orgId } = req.params;
  let { tier, cycle, method, phone } = req.body || {};

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  tier = String(tier || '').toLowerCase();
  cycle = String(cycle || '').toLowerCase();
  method = String(method || '').toUpperCase();
  if (method === 'MPESA' && phone) phone = normalizePhoneNumber(phone);

  const v = validateOrgSubInit({ tier, cycle, method, phone });
  if (!v.ok) return res.status(400).json({ message: v.message });

  const mem = await pool.query(
    `SELECT role
       FROM org_memberships
      WHERE org_id = $1 AND user_id = $2 AND role IN ('owner','admin')`,
    [orgId, userId]
  );
  if (!mem.rowCount) return res.status(403).json({ message: 'Forbidden' });

  // ✅ Base/intent currency is ALWAYS USD
  let amount_cents;
  try {
    ({ amount_cents } = resolvePrice(tier, cycle, 'USD'));
  } catch (e) {
    return res.status(400).json({ message: 'Invalid plan selection', error: e?.message || 'bad-price' });
  }
  if (!Number.isFinite(amount_cents) || Number(amount_cents) <= 0) {
    return res.status(400).json({ message: 'Invalid price for selection' });
  }

  // create pending payment intent (USD)
  const ins = await pool.query(
    `INSERT INTO org_subscription_payments
       (org_id, tier, cycle, currency, amount_cents, provider, status, meta)
     VALUES ($1,$2,$3,'USD',$4,$5,'pending', '{}'::jsonb)
     RETURNING *`,
    [orgId, tier, cycle, amount_cents, method]
  );
  const payment = ins.rows[0];

  try {
    // ───────────────────────── MPESA ─────────────────────────
    if (method === 'MPESA') {
      // You can either:
      // A) Keep your KES pricing table in orgPricing (old way), or
      // B) Convert USD → KES (same as Paystack) for consistent pricing across methods.
      //
      // This implementation uses B (USD→KES conversion), matching your request.
      const kesMinor = usdCentsToKesMinor(amount_cents);
      const kesMajorRounded = Math.max(1, Math.round(kesMinor / 100));

      await pool.query(
        `UPDATE org_subscription_payments
            SET meta = COALESCE(meta,'{}'::jsonb) ||
                      jsonb_build_object(
                        'intentCurrency','USD',
                        'intentAmountUsd', to_jsonb(($2::numeric)/100),
                        'chargeCurrency','KES',
                        'chargeAmountMinor', to_jsonb($3::int),
                        'fxUsdToKes', to_jsonb($4::numeric)
                      ),
                updated_at=NOW()
          WHERE id=$1`,
        [payment.id, amount_cents, kesMinor, FX_USD_TO_GATEWAY]
      );

      let stk;
      try {
        stk = await stkPushOrgSubscription({
          phone,
          amount: kesMajorRounded,
          accountReference: `ORG:${orgId}:${tier}:${cycle}`,
          description: `${tier.toUpperCase()} ${cycle} subscription`,
        });
      } catch (e) {
        const resp = e?.response;
        const safMsg =
          resp?.data?.errorMessage ||
          resp?.data?.error ||
          resp?.data?.fault?.faultstring ||
          resp?.statusText ||
          e?.message ||
          'mpesa-stk-unknown-error';

        await pool.query(
          `UPDATE org_subscription_payments
              SET status='failed', error_message=$2, updated_at=NOW()
            WHERE id=$1`,
          [payment.id, String(safMsg).slice(0, 1000)]
        );

        return res.status(502).json({ message: 'M-Pesa STK push failed' });
      }

      const checkoutId = stk?.CheckoutRequestID || stk?.data?.CheckoutRequestID || null;
      if (!checkoutId) {
        await pool.query(
          `UPDATE org_subscription_payments
              SET status='failed', error_message=$2, updated_at=NOW()
            WHERE id=$1`,
          [payment.id, 'No CheckoutRequestID in STK response']
        );
        return res.status(502).json({ message: 'Invalid response from M-Pesa' });
      }

      await pool.query(
        `UPDATE org_subscription_payments
            SET provider_txn_id=$2, updated_at=NOW()
          WHERE id=$1`,
        [payment.id, checkoutId]
      );

      return res.json({
        paymentId: payment.id,
        method,
        quote: { amount_cents, currency: 'USD', tier, cycle },
        charge: { currency: 'KES', expectedKesMinor: kesMinor, fxUsdToKes: FX_USD_TO_GATEWAY },
        checkoutRequestId: checkoutId,
      });
    }

    // ─────────────────────── PAYSTACK (KES charge) ───────────────────────
    // Email required
    let email = userEmailFromAuth;
    if (!email) {
      const u = await pool.query(`SELECT email FROM users WHERE id=$1`, [userId]);
      email = u.rows?.[0]?.email || null;
    }
    if (!email) {
      await pool.query(
        `UPDATE org_subscription_payments
            SET status='failed', error_message=$2, updated_at=NOW()
          WHERE id=$1`,
        [payment.id, 'Missing user email for Paystack initialize']
      );
      return res.status(400).json({ message: 'Your account email is missing. Please update your profile email.' });
    }

    // Reference tied to this payment
    const reference = `ps_org_${payment.id}_${Date.now()}`;

    // Convert USD intent → KES charge
    const expectedKesMinor = usdCentsToKesMinor(amount_cents);
    const expectedKesMajor = (expectedKesMinor / 100).toFixed(2);
    const intentUsdMajor = (Number(amount_cents) / 100).toFixed(2);

    // Persist FX audit into meta + save reference
    await pool.query(
      `UPDATE org_subscription_payments
          SET provider_order_id=$2,
              meta = COALESCE(meta,'{}'::jsonb) ||
                    jsonb_build_object(
                      'intentCurrency','USD',
                      'intentAmountUsd', to_jsonb(($3)::numeric),
                      'chargeCurrency','KES',
                      'chargeAmountKes', to_jsonb(($4)::numeric),
                      'chargeAmountMinor', to_jsonb(($5)::int),
                      'fxUsdToKes', to_jsonb(($6)::numeric)
                    ),
              updated_at=NOW()
        WHERE id=$1`,
      [
        payment.id,
        reference,
        intentUsdMajor,
        expectedKesMajor,
        expectedKesMinor,
        FX_USD_TO_GATEWAY,
      ]
    );

      const callbackBase = resolvePaystackCallbackBase(req);

      const callback_url = buildCallbackUrl(callbackBase, {
        kind: 'org',
        paymentId: payment.id, // callback page confirms without sessionStorage
      });



    const init = await paystackInitTransaction({
      email,
      amount_minor: expectedKesMinor,
      reference,
      callback_url,
      channels: ['card'],
      metadata: {
        kind: 'org',
        paymentId: String(payment.id),
        orgId: String(orgId),
        tier,
        cycle,
        userId: String(userId),
        intentUsd: intentUsdMajor,
        fxUsdToKes: FX_USD_TO_GATEWAY,
        expectedKesMinor,
      },
    });

    if (!init?.reference || !init?.authorization_url) {
      await pool.query(
        `UPDATE org_subscription_payments
            SET status='failed', error_message=$2, updated_at=NOW()
          WHERE id=$1`,
        [payment.id, 'No reference/authorization_url from Paystack']
      );
      return res.status(502).json({ message: 'Failed to initialize Paystack' });
    }

    return res.json({
      paymentId: payment.id,
      method,
      quote: { amount_cents, currency: 'USD', tier, cycle },
      charge: { currency: 'KES', expectedKesMinor, expectedKesMajor, fxUsdToKes: FX_USD_TO_GATEWAY },
      authorizationUrl: init.authorization_url,
      reference: init.reference,
    });
  } catch (err) {
    console.error('[orgBilling][init] error', err?.message || err);
    await pool.query(
      `UPDATE org_subscription_payments
          SET status='failed', error_message=$2, updated_at=NOW()
        WHERE id=$1`,
      [payment.id, err?.message || 'unknown']
    );
    return res.status(502).json({ message: 'Failed to initialize payment', error: err?.message || 'unknown' });
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/orgs/subscriptions/:paymentId/confirm                     */
/* Body (MPESA): { provider_reference } (optional)                     */
/* Body (PAYSTACK): { provider_reference?: reference }                 */
/* ------------------------------------------------------------------ */
export async function confirmOrgSubscription(req, res) {
  const userId = req.user?.id;
  const { paymentId } = req.params;
  const { provider_reference } = req.body || {};

  if (!userId) return res.status(401).json({ message: 'Unauthorized' });

  const client = await pool.connect();

  // helper: build jsonb patch safely
  const jsonbPatch = (obj) =>
    JSON.stringify(obj, (_k, v) => (v === undefined ? null : v));

  try {
    await client.query('BEGIN');

    const p = await client.query(
      `SELECT * FROM org_subscription_payments WHERE id=$1 FOR UPDATE`,
      [paymentId]
    );
    if (!p.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment not found' });
    }

    const pay = p.rows[0];

    // membership check
    const mem = await client.query(
      `SELECT role
         FROM org_memberships
        WHERE org_id=$1 AND user_id=$2 AND role IN ('owner','admin')`,
      [pay.org_id, userId]
    );
    if (!mem.rowCount) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: 'Forbidden' });
    }

    // idempotent
    if (pay.status === 'completed') {
      const sub = await client.query(
        `SELECT *
           FROM org_subscriptions
          WHERE org_id=$1 AND active=TRUE
          ORDER BY started_at DESC
          LIMIT 1`,
        [pay.org_id]
      );
      await client.query('COMMIT');
      return res.json({ ok: true, alreadyCompleted: true, subscription: sub.rows[0] || null });
    }

    if (pay.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Payment already ${pay.status}` });
    }

    const provider = String(pay.provider || '').toUpperCase();
    if (provider === 'MPESA') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'MPESA confirm logic unchanged — keep your existing code block here.' });
    }
    if (provider !== 'PAYSTACK') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Unsupported provider' });
    }

    // PAYSTACK confirm
    const reference = String(provider_reference || pay.provider_order_id || '').trim();
    if (!reference) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Missing Paystack reference.' });
    }

    const v = await paystackVerify(reference);

    if (String(v.status).toLowerCase() !== 'success') {
      await client.query('COMMIT'); // keep pending
      return res.json({ ok: false, status: String(v.status || 'pending'), message: 'not-success-yet' });
    }

    const gotCurrency = String(v.currency || '').toUpperCase();
    if (gotCurrency !== 'KES') {
      await client.query(
        `UPDATE org_subscription_payments
            SET status='failed',
                error_message=$2,
                meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
                updated_at=NOW()
          WHERE id=$1`,
        [
          pay.id,
          `currency mismatch: expected KES got ${gotCurrency}`,
          jsonbPatch({ failReason: 'currency_mismatch', gotCurrency }),
        ]
      );

      await client.query('COMMIT');
      return res.status(400).json({ message: `currency-mismatch (expected KES, got ${gotCurrency})` });
    }

    // meta can come as object or string (defensive)
    let meta = {};
    try {
      meta = typeof pay.meta === 'string' ? JSON.parse(pay.meta) : (pay.meta || {});
    } catch {
      meta = {};
    }

    const expectedMinor = Number.isFinite(Number(meta?.chargeAmountMinor))
      ? Number(meta.chargeAmountMinor)
      : null;

    const paidMinor = Number.isFinite(Number(v.amount))
      ? Number(v.amount)
      : null;

    if (expectedMinor == null || expectedMinor <= 0 || paidMinor == null || paidMinor !== expectedMinor) {
      await client.query(
        `UPDATE org_subscription_payments
            SET status='failed',
                error_message=$2,
                meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
                updated_at=NOW()
          WHERE id=$1`,
        [
          pay.id,
          'amount mismatch',
          jsonbPatch({
            failReason: 'amount_mismatch',
            expectedMinor,
            paidMinor,
            gotCurrency,
          }),
        ]
      );

      await client.query('COMMIT');
      return res.status(400).json({ message: 'amount-mismatch', expectedMinor, paidMinor });
    }

    // mark payment completed (single update, typed jsonb patch)
    const providerTxnId = String(v.transactionId || '');
    const finalRef = String(v.reference || reference);

    await client.query(
      `UPDATE org_subscription_payments
          SET status='completed',
              provider_txn_id=$2,
              provider_order_id=COALESCE(provider_order_id, $3),
              meta = COALESCE(meta,'{}'::jsonb) || $4::jsonb,
              updated_at=NOW()
        WHERE id=$1 AND status='pending'`,
      [
        pay.id,
        providerTxnId,
        finalRef,
        jsonbPatch({
          capturedCurrency: 'KES',
          capturedAmountMinor: paidMinor,
          paystackStatus: 'success',
          provider: 'PAYSTACK',
          providerId: providerTxnId,
        }),
      ]
    );

    // Activate subscription
    const fresh = await client.query(
      `SELECT * FROM org_subscription_payments WHERE id=$1`,
      [paymentId]
    );
    const sub = await activateOrgSubscriptionTx(client, fresh.rows[0]);

    await client.query('COMMIT');
    return res.json({ ok: true, subscription: sub });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}

    console.error('[orgBilling][confirm] error', e);
    return res.status(502).json({
      message: 'Failed to confirm subscription payment',
      error: e?.message || String(e),
      code: e?.code || null,
    });
  } finally {
    client.release();
  }
}
