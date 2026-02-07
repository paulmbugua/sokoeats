import fetch from 'node-fetch';
import pool from '../config/db.js';
import { notifyEvent } from '../services/notificationEvents.js';

const FEE_PCT = Number(process.env.PAYMENT_GATEWAY_PERCENT ?? 0);
const FEE_FIXED = Number(process.env.PAYMENT_GATEWAY_FIXED ?? 0.3);

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

const PAYPAL_ENV = (process.env.PAYPAL_ENV || 'sandbox').trim().toLowerCase();
const PP_BASE =
  PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

// match .env keys exactly
const PAYPAL_CLIENT_ID = (process.env.PAYPAL_CLIENT_ID || '').trim();
const PAYPAL_CLIENT_SECRET = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
const PAYPAL_WEBHOOK_ID = (process.env.PAYPAL_WEBHOOK_ID || '').trim();

// optional: quick sanity log
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
  throw new Error(
    `[paypal] Missing CLIENT_ID/CLIENT_SECRET. ENV=${PAYPAL_ENV}`,
  );
}
console.info(
  `[paypal] ENV=${PAYPAL_ENV} ID=${PAYPAL_CLIENT_ID.slice(0, 4)}…${PAYPAL_CLIENT_ID.slice(-4)}`,
);

async function getAccessToken() {
  const basic = Buffer.from(
    `${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`,
  ).toString('base64');

  const r = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    console.error('[paypal][oauth] failed', r.status, text);
    throw new Error(`oauth failed: ${r.status} ${text}`);
  }
  const j = await r.json();
  return j.access_token;
}

function toUsdString(seedPrice) {
  if (seedPrice == null) throw new Error('Package has no price');
  const n = Number(seedPrice);
  if (Number.isNaN(n)) throw new Error('Invalid package price');
  const asDollars = n >= 100 ? n / 100 : n;
  return asDollars.toFixed(2);
}

async function getPackageById(packageId) {
  const { rows } = await pool.query(
    'SELECT id, credits, price, offer FROM packages WHERE id = $1',
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

/* ------------------------- create PayPal order ------------------------- */
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
    const amountUSD = toUsdString(pkg.price);

    // Create a pending payment row first
    const { rows } = await pool.query(
      `INSERT INTO payments (user_id, package_id, payment_method, status, amount, currency)
       VALUES ($1, $2, 'PAYPAL', 'Pending', $3, 'USD')
       RETURNING id`,
      [userId, pkg.id, amountUSD],
    );
    const paymentRow = rows[0];

    const access = await getAccessToken();
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: amountUSD },
          description: `${pkg.credits} Tokens — ${pkg.offer || 'Package'}`,
          reference_id: `pay:${paymentRow.id}:pkg:${pkg.id}:user:${userId}`,
        },
      ],
      application_context: { shipping_preference: 'NO_SHIPPING' },
    };

    const r = await fetch(`${PP_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error('[paypal][create-order] PayPal error', r.status, j);
      return res.status(r.status).json(j);
    }

    await pool.query(
      'UPDATE payments SET transaction_id = $1, updated_at = NOW() WHERE id = $2',
      [j.id, paymentRow.id],
    );

    return res.json({ id: j.id }); // orderID for client
  } catch (e) {
    console.error('[paypal][create-order] ERROR', e);
    return res
      .status(500)
      .json({ message: 'create-order-failed', error: e?.message || 'unknown' });
  }
}

/* -------------------------- capture PayPal order -------------------------- */
export async function captureOrder(req, res) {
  const orderId = req.params.id;
  if (!orderId) return res.status(400).json({ message: 'missing order id' });

  try {
    const access = await getAccessToken();
    const r = await fetch(`${PP_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json',
      },
    });
    const j = await r.json();

    if (!r.ok) {
      console.error('[paypal][capture] PayPal error', r.status, j);
      return res.status(r.status).json(j);
    }

    const capture = j?.purchase_units?.[0]?.payments?.captures?.[0];
    const captureId = capture?.id;
    const payerEmail = j?.payer?.email_address || capture?.payer?.email_address;

    const { rows } = await pool.query(
      'SELECT id, user_id, package_id, status FROM payments WHERE transaction_id = $1 LIMIT 1',
      [orderId],
    );
    if (!rows[0]) {
      console.warn(
        '[paypal][capture] payment row not found for order',
        orderId,
      );
      return res.json(j);
    }
    const payment = rows[0];

    if (payment.status === 'Completed') {
      return res.json(j);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        'UPDATE payments SET capture_id = $1, payer_email = $2, updated_at = NOW() WHERE id = $3',
        [captureId, payerEmail || null, payment.id],
      );

      // amount captured from PayPal (string like "21.46")
      const amountCapturedUsd =
        capture?.amount?.value ?? j?.purchase_units?.[0]?.amount?.value ?? null;

      // Record fees (estimate unless you parse PayPal reports later)
      try {
        await recordPaymentFees(payment.id, amountCapturedUsd);
      } catch (feeErr) {
        console.warn(
          '[paypal][capture] fee record failed (non-fatal)',
          feeErr?.message,
        );
      }

      const { tokens, credits } = await creditTokensAndCompletePayment(client, {
        paymentId: payment.id,
        userId: payment.user_id,
        packageId: payment.package_id,
      });

      await client.query('COMMIT');
      void notifyEvent(
        'TOKENS_PURCHASED',
        String(payment.user_id),
        {
          credits,
          tokensBalance: tokens,
        },
      ).catch((e) =>
        console.warn('[push] tokens purchased notify failed', e?.message || e),
      );
      return res.json({ ...j, tokensCredited: true, tokensBalance: tokens });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[paypal][capture] tx error', txErr);
      return res.json(j);
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[paypal][capture] ERROR', e);
    return res.status(500).json({
      message: 'capture-order-failed',
      error: e?.message || 'unknown',
    });
  }
}

/* ------------------------------ webhooks ------------------------------ */

async function verifyWebhookSignature(req, rawBody) {
  try {
    const transmissionId = req.get('paypal-transmission-id');
    const transmissionTime = req.get('paypal-transmission-time');
    const certUrl = req.get('paypal-cert-url');
    const authAlgo = req.get('paypal-auth-algo');
    const transmissionSig = req.get('paypal-transmission-sig');

    if (
      !transmissionId ||
      !transmissionTime ||
      !certUrl ||
      !authAlgo ||
      !transmissionSig ||
      !PAYPAL_WEBHOOK_ID
    ) {
      return false;
    }

    const access = await getAccessToken();
    const body = {
      transmission_id: transmissionId,
      transmission_time: transmissionTime,
      cert_url: certUrl,
      auth_algo: authAlgo,
      transmission_sig: transmissionSig,
      webhook_id: PAYPAL_WEBHOOK_ID,
      webhook_event: JSON.parse(rawBody.toString('utf8')),
    };

    const r = await fetch(
      `${PP_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${access}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    const j = await r.json();
    return j?.verification_status === 'SUCCESS';
  } catch (err) {
    console.error('[paypal][webhook] verify error', err);
    return false;
  }
}

export async function webhooks(req, res) {
  try {
    const raw = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const verified = await verifyWebhookSignature(req, raw);
    if (!verified) return res.status(400).send('invalid signature');

    const event = req.body;
    const type = event?.event_type;

    if (type === 'PAYMENT.CAPTURE.COMPLETED') {
      const captureId = event?.resource?.id;
      const orderId =
        event?.resource?.supplementary_data?.related_ids?.order_id;
      const amount = event?.resource?.amount?.value;
      const currency = event?.resource?.amount?.currency_code;
      const payerEmail = event?.resource?.payer?.email_address;

      const { rows } = await pool.query(
        'SELECT id, user_id, package_id, status FROM payments WHERE transaction_id = $1 LIMIT 1',
        [orderId],
      );
      if (!rows[0]) {
        console.warn('[paypal][webhook] payment not found for order', orderId);
        return res.status(200).send('ok');
      }
      const payment = rows[0];

      if (payment.status === 'Completed') return res.status(200).send('ok');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query(
          'UPDATE payments SET capture_id = $1, payer_email = $2, amount = $3, currency = $4, updated_at = NOW() WHERE id = $5',
          [captureId, payerEmail || null, amount, currency, payment.id],
        );

        // Record fees based on webhook amount
        try {
          await recordPaymentFees(payment.id, amount);
        } catch (feeErr) {
          console.warn(
            '[paypal][webhook] fee record failed (non-fatal)',
            feeErr?.message,
          );
        }

        const { tokens, credits } = await creditTokensAndCompletePayment(client, {
          paymentId: payment.id,
          userId: payment.user_id,
          packageId: payment.package_id,
        });

        await client.query('COMMIT');
        void notifyEvent(
          'TOKENS_PURCHASED',
          String(payment.user_id),
          {
            credits,
            tokensBalance: tokens,
          },
        ).catch((e) =>
          console.warn('[push] tokens purchased notify failed', e?.message || e),
        );
        return res.status(200).send('ok');
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('[paypal][webhook] tx error', txErr);
        return res.status(200).send('ok');
      } finally {
        client.release();
      }
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error('[paypal][webhook] ERROR', e);
    return res.status(500).send('webhook error');
  }
}
