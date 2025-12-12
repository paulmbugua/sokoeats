// controllers/paystackController.js
import fetch from 'node-fetch';
import crypto from 'crypto';
import pool from '../config/db.js';

const FEE_PCT   = Number(process.env.PAYMENT_GATEWAY_PERCENT ?? 0);
const FEE_FIXED = Number(process.env.PAYMENT_GATEWAY_FIXED   ?? 0.30);
const FX_USD_TO_GATEWAY = Number(process.env.PAYSTACK_USD_TO_GATEWAY_RATE || 130); 
// e.g. 1 USD = 130 KES

const PAYSTACK_SECRET_KEY = (process.env.PAYSTACK_SECRET_KEY || '').trim();
const PAYSTACK_BASE       = 'https://api.paystack.co';
const PAYSTACK_CURRENCY   = (process.env.PAYSTACK_CURRENCY || 'USD').toUpperCase();

if (!PAYSTACK_SECRET_KEY) {
  throw new Error('[paystack] Missing PAYSTACK_SECRET_KEY');
}

/* ----------------------- shared helpers (same semantics) ----------------------- */

async function recordPaymentFees(paymentId, amountCapturedUsd, explicit = null) {
  const fee_fixed_usd = explicit?.fixedUsd ?? FEE_FIXED;
  const fee_percent   = explicit?.percent  ?? FEE_PCT;
  const fee_total_usd = explicit?.totalUsd ??
    Math.round((Number(amountCapturedUsd || 0) * fee_percent + fee_fixed_usd) * 100) / 100;

  await pool.query(
    `UPDATE payments
        SET fee_fixed_usd = $1,
            fee_percent   = $2,
            fee_total_usd = $3,
            updated_at    = NOW()
      WHERE id = $4`,
    [fee_fixed_usd, fee_percent, fee_total_usd, paymentId]
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

async function creditTokensAndCompletePayment(client, { paymentId, userId, packageId }) {
  const pkgRes = await client.query('SELECT credits FROM packages WHERE id = $1', [packageId]);
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

// Convert a numeric amount in *gateway currency* to minor units
function toMinorUnits(amountStr) {
  const n = Number(amountStr);
  if (Number.isNaN(n)) throw new Error('Invalid amount');
  return Math.round(n * 100);
}

// Convert a USD amount string to *gateway currency* minor units
function usdToGatewayMinor(amountUsdStr) {
  const usd = Number(amountUsdStr);
  if (Number.isNaN(usd)) throw new Error('Invalid USD amount');

  // If your Paystack account is in USD, FX = 1, else use configured FX
  const fx = PAYSTACK_CURRENCY === 'USD' ? 1 : FX_USD_TO_GATEWAY;

  const gatewayAmount = usd * fx; // e.g. 19.2 * 130 = 2496 KES

  console.log('[paystack][fx]', {
    amountUSD: usd.toFixed(2),
    gatewayAmount,
    currency: PAYSTACK_CURRENCY,
    fx,
  });

  // Paystack expects minor units (e.g. KES cents)
  return Math.round(gatewayAmount * 100);
}

/* --------------------- create Paystack "order" (hosted page) --------------------- */
// POST /api/paystack/create-order
export async function createOrder(req, res) {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: User not authenticated' });
    }

    const { packageId } = req.body || {};
    if (!packageId) {
      return res.status(400).json({ message: 'missing packageId' });
    }

    const pkg = await getPackageById(packageId);

    // We expect to only use USD packages for card/Paystack
    if ((pkg.currency || '').toUpperCase() !== 'USD') {
      return res.status(400).json({ message: 'Package currency must be USD for Paystack card checkout' });
    }

    const amountUSD = Number(pkg.price).toFixed(2);

    // Need buyer email for Paystack
    const { rows: userRows } = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    const user = userRows[0];
    if (!user?.email) {
      return res.status(400).json({ message: 'User email not found' });
    }

    // (1) Create pending payments row
    const { rows } = await pool.query(
      `INSERT INTO payments (user_id, package_id, payment_method, status, amount, currency)
       VALUES ($1, $2, 'PAYSTACK', 'Pending', $3, 'USD')
       RETURNING id`,
      [userId, pkg.id, amountUSD],
    );
    const paymentRow = rows[0];

    // (2) Generate Paystack reference tied to this payment
    const reference = `ps_${paymentRow.id}_${Date.now()}`;

    await pool.query(
      'UPDATE payments SET transaction_id = $1, updated_at = NOW() WHERE id = $2',
      [reference, paymentRow.id],
    );

    // (3) Initialize Paystack transaction (amountMinor is in PAYSTACK_CURRENCY)
    const amountMinor =
      PAYSTACK_CURRENCY === 'USD'
        ? toMinorUnits(amountUSD)
        : usdToGatewayMinor(amountUSD);

    const psBody = {
      email: user.email,
      amount: amountMinor,
      currency: PAYSTACK_CURRENCY,
      reference,
      callback_url: process.env.PAYSTACK_CALLBACK_URL || undefined,
      metadata: {
        paymentId: paymentRow.id,
        userId,
        packageId: pkg.id,
        usdPrice: amountUSD,
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
    const j = await r.json();

    if (!r.ok || !j.status) {
      console.error('[paystack][create-order] error', r.status, j);
      return res.status(500).json({
        message: 'paystack-init-failed',
        providerStatus: j.status,
        providerMessage: j.message,
      });
    }

    return res.json({
      paymentId: paymentRow.id,
      reference: j.data.reference,
      authorization_url: j.data.authorization_url,
      access_code: j.data.access_code,
      priceUsd: amountUSD,
      credits: pkg.credits,
      offer: pkg.offer,
    });
  } catch (e) {
    console.error('[paystack][create-order] ERROR', e);
    return res
      .status(500)
      .json({ message: 'create-order-failed', error: e?.message || 'unknown' });
  }
}

/* ------------------------ INLINE CARD CHARGE (no redirect) ------------------------ */
// POST /api/paystack/card-charge
// body: { packageId, card: { number, exp_month, exp_year, cvc, name }, email? }
export async function cardCharge(req, res) {
  try {
    const userId = req?.user?.id;
    const userEmailFromToken = req?.user?.email;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: user not authenticated' });
    }

    const { packageId, card, email } = req.body || {};

    if (!packageId) {
      return res.status(400).json({ message: 'Missing packageId' });
    }

    if (!card || !card.number || !card.cvc || !card.exp_month || !card.exp_year) {
      return res.status(400).json({ message: 'Missing card details' });
    }

    // 1) Load package (server is source of truth for price)
    const pkg = await getPackageById(packageId);

    if ((pkg.currency || '').toUpperCase() !== 'USD') {
      return res.status(400).json({ message: 'Package currency must be USD for card payment' });
    }

    const amountUsdNum = Number(pkg.price);
    if (!Number.isFinite(amountUsdNum) || amountUsdNum <= 0) {
      throw new Error(`Invalid package price for packageId ${packageId}`);
    }
    const amountUSD = amountUsdNum.toFixed(2);

    // Ensure we ALWAYS send a valid email to Paystack
    const { rows: userRows } = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [userId],
    );
    const dbUser = userRows[0];
    const emailToUse = email || userEmailFromToken || dbUser?.email;

    if (!emailToUse) {
      return res.status(400).json({
        message: 'Cannot charge card: user email not found. Please update your email profile.',
      });
    }

    // 2) Compute amount in gateway currency minor units
    const amountMinor =
      PAYSTACK_CURRENCY === 'USD'
        ? toMinorUnits(amountUSD)
        : usdToGatewayMinor(amountUSD);

    // 3) Create a pending payments row
    const { rows } = await pool.query(
      `INSERT INTO payments (user_id, package_id, payment_method, status, amount, currency)
       VALUES ($1, $2, 'PAYSTACK', 'Pending', $3, 'USD')
       RETURNING id`,
      [userId, pkg.id, amountUSD],
    );
    const payment = rows[0];

    // 4) Generate stable reference for Paystack + DB
    const reference = `psk_${payment.id}_${Date.now()}`;
    await pool.query(
      'UPDATE payments SET transaction_id = $1, updated_at = NOW() WHERE id = $2',
      [reference, payment.id],
    );

    // 5) Build /charge payload
    const rawNumber = String(card.number || '').replace(/\s+/g, '');
    const expMonth  = String(card.exp_month || '').padStart(2, '0');
    let   expYear   = String(card.exp_year || '');
    if (expYear.length === 2) {
      expYear = `20${expYear}`;
    }

    const cvc = String(card.cvc || '');
    const cardholderName = String(card.name || '').trim();

    const chargeBody = {
      email: emailToUse,
      amount: amountMinor,
      currency: PAYSTACK_CURRENCY, // e.g. 'KES'
      reference,
      card: {
        number: rawNumber,
        cvv: cvc,
        expiry_month: expMonth,
        expiry_year: expYear,
      },
      metadata: {
        paymentId: payment.id,
        userId,
        packageId: pkg.id,
        credits: pkg.credits,
        offer: pkg.offer,
        source: 'daybreak-card-inline',
        cardholderName,
      },
    };

    // 🔎 LOG what we’re about to send (mask card)
    console.log('[paystack][card-charge] request', {
      userId,
      packageId,
      amountUSD,
      gatewayAmount: amountMinor / 100,
      amountMinor,
      paystackCurrency: PAYSTACK_CURRENCY,
      emailToUse,
      reference,
      cardMasked: {
        number: rawNumber.replace(/\d(?=\d{4})/g, 'x'),
        cvv: '***',
        expiry_month: expMonth,
        expiry_year: expYear,
      },
      fx: FX_USD_TO_GATEWAY,
    });

    const r = await fetch(`${PAYSTACK_BASE}/charge`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(chargeBody),
    });

    const j = await r.json().catch(() => null);

    // 🔎 LOG raw response
    console.log('[paystack][card-charge] response HTTP', r.status);
    console.log('[paystack][card-charge] response body', JSON.stringify(j, null, 2));

    if (!r.ok || !j) {
      console.error('[paystack][card-charge] HTTP error', r.status, j);
      return res
        .status(502)
        .json({ message: 'Paystack charge failed', httpStatus: r.status, raw: j });
    }

    if (!j.status) {
      console.warn('[paystack][card-charge] Paystack error', j);
      return res.status(400).json({
        message: j.message || 'Charge failed',
        providerMessage: j.message,
        raw: j,
      });
    }

    const data = j.data || {};
    const paystackStatus   = data.status;            // 'success', 'send_otp', 'failed', etc.
    const paystackRef      = data.reference;
    const gatewayResponse  = data.gateway_response;  // e.g. "Charge attempted"
    const displayText      = data.display_text;      // friendly text
    const authMode         = data.authorization?.authorization_code;
    const authUrl          = data?.authorization_url || data?.url; // in some flows

    // 🔎 LOG status-specific info
    console.log('[paystack][card-charge] status block', {
      paystackStatus,
      gatewayResponse,
      displayText,
      authMode,
      authUrl,
    });

    // Keep DB aligned with Paystack's final reference if it differs
    if (paystackRef && paystackRef !== reference) {
      await pool.query(
        'UPDATE payments SET transaction_id = $1, updated_at = NOW() WHERE id = $2',
        [paystackRef, payment.id],
      );
    }

    // If not fully successful (OTP / pending / failed / etc.), we *don’t* credit tokens here
    if (paystackStatus !== 'success') {
      console.log('[paystack][card-charge] non-success status', paystackStatus);

      const requiresAction =
        paystackStatus === 'send_otp' ||
        paystackStatus === 'open_url' ||
        paystackStatus === 'pending';

      return res.json({
        ok: false,
        requiresAction,
        paystackStatus,
        reference: paystackRef || reference,
        gatewayResponse,
        displayText,
        authMode,
        authUrl,
        message:
          j.message ||
          gatewayResponse ||
          displayText ||
          'Card charge attempted but not completed.',
        raw: j,
      });
    }

    // Success path — mark payment Completed + credit tokens
    const payerEmail =
      data?.customer?.email ||
      emailToUse ||
      null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const amountMinorResp = typeof data.amount === 'number' ? data.amount : amountMinor;
      const amountMajorResp = (amountMinorResp / 100).toFixed(2);
      const currencyResp    = (data.currency || PAYSTACK_CURRENCY || 'USD').toUpperCase();
      const providerId      = String(data.id ?? '');

      await client.query(
        `UPDATE payments
            SET capture_id = $1,
                payer_email = $2,
                amount      = $3,
                currency    = $4,
                status      = 'Completed',
                updated_at  = NOW()
          WHERE id = $5`,
        [providerId, payerEmail, amountMajorResp, currencyResp, payment.id],
      );

      // Record fees (if Paystack supplies them)
      try {
        const feesMinor = typeof data.fees === 'number' ? data.fees : null;
        const explicitFees = feesMinor != null
          ? { totalUsd: Number((feesMinor / 100).toFixed(2)) }
          : undefined;
        await recordPaymentFees(payment.id, Number(amountMajorResp), explicitFees);
      } catch (feeErr) {
        console.warn('[paystack][card-charge] fee record failed (non-fatal)', feeErr?.message);
      }

      const { tokens, credits } = await creditTokensAndCompletePayment(client, {
        paymentId: payment.id,
        userId,
        packageId: pkg.id,
      });

      await client.query('COMMIT');

      console.log('[paystack][card-charge] SUCCESS', {
        reference: paystackRef || reference,
        tokensBalance: tokens,
        creditsPurchased: credits,
      });

      return res.json({
        ok: true,
        status: 'success',
        reference: paystackRef || reference,
        tokensBalance: tokens,
        creditsPurchased: credits,
        paystack: j,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[paystack][card-charge] tx error', txErr);
      return res.status(200).json({
        ok: false,
        status: 'internal-tx-error',
        message: 'Charge succeeded but local update failed',
        paystack: j,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[paystack][card-charge] ERROR', e);
    return res
      .status(500)
      .json({ message: 'card-charge-failed', error: e?.message || 'unknown' });
  }
}

/* ------------------------ OTP SUBMIT FOR CARD CHARGE ------------------------ */
// POST /api/paystack/submit-otp
// body: { reference, otp }
export async function submitOtpCharge(req, res) {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: user not authenticated' });
    }

    const { reference, otp } = req.body || {};
    if (!reference || !otp) {
      return res.status(400).json({ message: 'Missing reference or otp' });
    }

    console.log('[paystack][submit-otp] incoming', { userId, reference, otpMasked: otp.replace(/./g, '*') });

    // Find the pending payment for this reference
    const { rows } = await pool.query(
      'SELECT id, user_id, package_id, status FROM payments WHERE transaction_id = $1 LIMIT 1',
      [reference],
    );

    if (!rows[0]) {
      console.warn('[paystack][submit-otp] payment not found for reference', reference);
      return res.status(404).json({ message: 'Payment not found for this reference' });
    }
    const payment = rows[0];

    console.log('[paystack][submit-otp] found payment row', payment);

    // If it's already completed, just echo success
    if (payment.status === 'Completed') {
      console.log('[paystack][submit-otp] payment already completed, short-circuit', { reference });
      return res.json({
        ok: true,
        status: 'success',
        reference,
        message: 'Payment already processed.',
      });
    }

    const body = {
      otp,
      reference,
    };

    console.log('[paystack][submit-otp] calling Paystack /charge/submit_otp with', {
      reference,
      otpMasked: otp.replace(/./g, '*'),
    });

    const r = await fetch(`${PAYSTACK_BASE}/charge/submit_otp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const j = await r.json().catch(() => null);

    console.log('[paystack][submit-otp] response HTTP', r.status);
    console.log('[paystack][submit-otp] response body', JSON.stringify(j, null, 2));

    if (!r.ok || !j) {
      console.error('[paystack][submit-otp] HTTP error', r.status, j);
      return res
        .status(502)
        .json({ message: 'Paystack OTP submit failed', httpStatus: r.status, raw: j });
    }

    if (!j.status) {
      console.warn('[paystack][submit-otp] Paystack error', j);
      return res.status(400).json({
        message: j.message || 'OTP verification failed',
        providerMessage: j.message,
        raw: j,
      });
    }

    const data = j.data || {};
    const paystackStatus   = data.status;           // 'success', 'pending', etc.
    const gatewayResponse  = data.gateway_response;
    const displayText      = data.display_text;

    console.log('[paystack][submit-otp] status block', {
      paystackStatus,
      gatewayResponse,
      displayText,
    });

    if (paystackStatus !== 'success') {
      // Still not final; let frontend decide what to do
      return res.json({
        ok: false,
        requiresAction: true,
        paystackStatus,
        reference,
        gatewayResponse,
        displayText,
        message: j.message || gatewayResponse || displayText || 'OTP accepted, waiting for final result.',
        raw: j,
      });
    }

    // Success – finalise payment + credit tokens
    const payerEmail = data.customer?.email || null;
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const amountMinor = typeof data.amount === 'number' ? data.amount : null;
      const amountMajor = amountMinor != null
        ? (amountMinor / 100).toFixed(2)
        : null;
      const currencyResp = (data.currency || PAYSTACK_CURRENCY || 'USD').toUpperCase();
      const providerId   = String(data.id ?? '');

      await client.query(
        `UPDATE payments
            SET capture_id = $1,
                payer_email = $2,
                amount      = COALESCE($3, amount),
                currency    = COALESCE($4, currency),
                status      = 'Completed',
                updated_at  = NOW()
          WHERE id = $5`,
        [providerId, payerEmail, amountMajor, currencyResp, payment.id],
      );

      // Record fees if present
      try {
        const feesMinor = typeof data.fees === 'number' ? data.fees : null;
        const explicitFees = feesMinor != null
          ? { totalUsd: Number((feesMinor / 100).toFixed(2)) }
          : undefined;
        const amountCaptured = amountMajor ? Number(amountMajor) : null;
        await recordPaymentFees(payment.id, amountCaptured, explicitFees);
      } catch (feeErr) {
        console.warn('[paystack][submit-otp] fee record failed (non-fatal)', feeErr?.message);
      }

      const { tokens, credits } = await creditTokensAndCompletePayment(client, {
        paymentId: payment.id,
        userId: payment.user_id,
        packageId: payment.package_id,
      });

      await client.query('COMMIT');

      console.log('[paystack][submit-otp] SUCCESS', {
        reference,
        tokensBalance: tokens,
        creditsPurchased: credits,
      });

      return res.json({
        ok: true,
        status: 'success',
        reference,
        tokensBalance: tokens,
        creditsPurchased: credits,
        paystack: j,
      });
    } catch (txErr) {
      await client.query('ROLLBACK');
      console.error('[paystack][submit-otp] tx error', txErr);
      return res.status(200).json({
        ok: false,
        status: 'internal-tx-error',
        message: 'OTP accepted but local update failed',
        paystack: j,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error('[paystack][submit-otp] ERROR', e);
    return res
      .status(500)
      .json({ message: 'submit-otp-failed', error: e?.message || 'unknown' });
  }
}

/* ------------------------ Paystack webhook (capture) ------------------------ */
// POST /api/paystack/webhook
export const handlePaystackWebhook = async (req, res) => {
  console.log('[paystack][webhook] Event:', JSON.stringify(req.body, null, 2));

  const paystackSignature = req.headers['x-paystack-signature'];
  const secretKey = PAYSTACK_SECRET_KEY;

  const hash = crypto
    .createHmac('sha512', secretKey)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== paystackSignature) {
    console.warn('[paystack][webhook] Invalid signature');
    return res.status(400).json({ message: 'Invalid signature' });
  }

  const event = req.body;

  try {
    if (event.event === 'charge.success') {
      const data = event.data || {};
      const reference   = data.reference;
      const status      = data.status;       // 'success'
      const amountMinor = data.amount;       // integer, minor units
      const currency    = (data.currency || '').toUpperCase();
      const payerEmail  = data.customer?.email || null;
      const providerId  = String(data.id);
      const feesMinor   = typeof data.fees === 'number' ? data.fees : null;

      const { rows } = await pool.query(
        'SELECT id, user_id, package_id, status FROM payments WHERE transaction_id = $1 LIMIT 1',
        [reference],
      );

      if (!rows[0]) {
        console.error('[paystack][webhook] Payment record not found for reference:', reference);
        return res.status(404).json({ message: 'Payment record not found' });
      }

      const payment = rows[0];

      if (payment.status === 'Completed') {
        console.log(`[paystack][webhook] Payment for reference ${reference} already processed.`);
        return res.status(200).json({ message: 'Payment already processed.' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const amountMajor = amountMinor != null
          ? (amountMinor / 100).toFixed(2)
          : null;

        await client.query(
          `UPDATE payments
              SET capture_id = $1,
                  payer_email = $2,
                  amount      = COALESCE($3, amount),
                  currency    = COALESCE($4, currency),
                  updated_at  = NOW()
            WHERE id = $5`,
          [providerId, payerEmail, amountMajor, currency || null, payment.id],
        );

        // Record fees
        try {
          const amountCapturedUsd = amountMajor ? Number(amountMajor) : null;
          const explicitFees = feesMinor != null
            ? { totalUsd: Number((feesMinor / 100).toFixed(2)) }
            : null;

          await recordPaymentFees(payment.id, amountCapturedUsd, explicitFees || undefined);
        } catch (feeErr) {
          console.warn('[paystack][webhook] fee record failed (non-fatal)', feeErr?.message);
        }

        if (status === 'success') {
          await creditTokensAndCompletePayment(client, {
            paymentId: payment.id,
            userId: payment.user_id,
            packageId: payment.package_id,
          });
        } else {
          await client.query(
            "UPDATE payments SET status = 'Failed', updated_at = NOW() WHERE id = $1",
            [payment.id],
          );
        }

        await client.query('COMMIT');
        return res.status(200).json({ message: 'Webhook processed successfully' });
      } catch (txErr) {
        await client.query('ROLLBACK');
        console.error('[paystack][webhook] tx error', txErr);
        return res.status(500).json({ message: 'Failed to process webhook (tx)' });
      } finally {
        client.release();
      }
    }

    return res.status(200).json({ message: 'Event ignored' });
  } catch (error) {
    console.error('[paystack][webhook] ERROR:', error.message || error);
    return res.status(500).json({ message: 'Failed to process webhook', error: error.message });
  }
};
