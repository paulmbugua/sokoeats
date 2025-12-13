// controllers/paystackVerifyController.js (ESM)
import fetch from 'node-fetch';
import pool from '../config/db.js';

const PAYSTACK_SECRET = (process.env.PAYSTACK_SECRET_KEY || '').trim();
if (!PAYSTACK_SECRET) throw new Error('Missing PAYSTACK_SECRET_KEY');

const PAYSTACK_CURRENCY = (process.env.PAYSTACK_CURRENCY || 'KES').toUpperCase();
if (PAYSTACK_CURRENCY !== 'KES') {
  throw new Error(`PAYSTACK_CURRENCY must be KES, got ${PAYSTACK_CURRENCY}`);
}

// Fallback only (prefer meta.chargeAmountMinor captured at create-order time)
const FX_USD_TO_KES = Number(process.env.PAYSTACK_USD_TO_GATEWAY_RATE || 130);

async function verifyPaystack(reference) {
  const r = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
  );

  const j = await r.json().catch(() => null);

  // Paystack errors should not look like "our server crashed"
  if (!r.ok) {
    const msg = j?.message || `Paystack verify failed: ${r.status}`;
    const err = new Error(msg);
    err.statusCode = 502;
    err.provider = 'paystack';
    err.http = r.status;
    err.payload = j;
    throw err;
  }

  if (!j?.status) {
    const err = new Error('Paystack verify returned invalid payload');
    err.statusCode = 502;
    err.provider = 'paystack';
    err.payload = j;
    throw err;
  }

  return j; // { status, message, data: {...} }
}

function usdToKesMinor(amountUsdStr) {
  const usd = Number(amountUsdStr);
  if (!Number.isFinite(usd)) throw new Error('Invalid USD amount');
  const kes = usd * FX_USD_TO_KES;
  return Math.round(kes * 100);
}

async function creditTokensAndCompletePayment(client, { paymentId, userId, packageId }) {
  const pkgRes = await client.query('SELECT credits FROM packages WHERE id = $1', [packageId]);
  if (!pkgRes.rows[0]) throw new Error('Package not found');

  const credits = Number(pkgRes.rows[0].credits || 0);
  if (!Number.isFinite(credits) || credits <= 0) throw new Error('Invalid package credits');

  const userRes = await client.query(
    'UPDATE users SET tokens = tokens + $1 WHERE id = $2 RETURNING tokens',
    [credits, userId]
  );
  if (!userRes.rows[0]) throw new Error('User not found');

  await client.query(
    "UPDATE payments SET status = 'Completed', updated_at = NOW() WHERE id = $1 AND status <> 'Completed'",
    [paymentId]
  );

  return { tokens: Number(userRes.rows[0].tokens ?? 0), credits };
}

/**
 * verifyAndFinalize(reference)
 * - idempotent (row-lock + Completed check)
 * - callback-friendly (returns 200 for pending / not-yet-success)
 * - validates against meta.chargeAmountMinor if present
 */
export async function verifyAndFinalize(req, res) {
  const reference = String(req.params.reference || '').trim();
  if (!reference) return res.status(400).json({ ok: false, status: 'failed', message: 'missing-reference' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // IMPORTANT: support either schema style:
    // - payment_method = 'PAYSTACK'
    // - OR provider = 'PAYSTACK'
    // Keep BOTH so you don't silently miss rows.
    const lockRes = await client.query(
      `SELECT id, user_id, package_id, status, amount, currency, capture_id, meta
         FROM payments
        WHERE transaction_id = $1
          AND (
            payment_method = 'PAYSTACK'
            OR provider = 'PAYSTACK'
          )
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE`,
      [reference]
    );

    const payment = lockRes.rows[0];
    if (!payment) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        ok: false,
        status: 'failed',
        message: 'payment-not-found-for-reference',
        reference,
      });
    }

    // Idempotent: if already completed, return balance
    if (String(payment.status).toLowerCase() === 'completed') {
      const bal = await client.query('SELECT tokens FROM users WHERE id = $1', [payment.user_id]);
      await client.query('COMMIT');
      return res.json({
        ok: true,
        status: 'success',
        alreadyCompleted: true,
        reference,
        tokensBalance: Number(bal.rows[0]?.tokens ?? 0),
      });
    }

    // Verify with Paystack (source of truth)
    const v = await verifyPaystack(reference);
    const d = v?.data;

    // If Paystack hasn't marked success yet, DO NOT throw 409.
    // Return 200 so your callback page can keep polling cleanly.
    const payStatus = String(d?.status || 'pending').toLowerCase();
    if (!d || payStatus !== 'success') {
      await client.query('COMMIT'); // keep payment pending
      return res.json({
        ok: false,
        status: payStatus || 'pending',
        message: 'not-success-yet',
        reference,
      });
    }

    // Currency MUST be KES
    const currency = String(d.currency || '').toUpperCase();
    if (currency !== 'KES') {
      await client.query(
        `UPDATE payments
            SET status = 'Failed',
                updated_at = NOW(),
                meta = COALESCE(meta,'{}'::jsonb) ||
                      jsonb_build_object('failReason','currency_mismatch','gotCurrency',$1)
          WHERE id = $2`,
        [currency, payment.id]
      );
      await client.query('COMMIT');
      return res.json({
        ok: false,
        status: 'failed',
        message: `currency-mismatch (expected KES, got ${currency || 'unknown'})`,
        reference,
      });
    }

    // Determine expected amount:
    // ✅ BEST: use the exact minor amount you created the order with.
    // (store it as meta.chargeAmountMinor when creating order)
    let expectedMinor = null;
    const metaCharge = Number(payment?.meta?.chargeAmountMinor);
    if (Number.isFinite(metaCharge) && metaCharge > 0) {
      expectedMinor = metaCharge;
    } else {
      // Fallback: recompute from package USD price (less reliable)
      const pkgRes = await client.query(`SELECT price, currency FROM packages WHERE id = $1 LIMIT 1`, [
        payment.package_id,
      ]);
      const pkg = pkgRes.rows[0];
      if (!pkg) {
        await client.query('ROLLBACK');
        return res.status(500).json({ ok: false, status: 'failed', message: 'package-missing-during-verify' });
      }
      const pkgCur = String(pkg.currency || '').toUpperCase();
      if (pkgCur !== 'USD') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          status: 'failed',
          message: `package-currency-mismatch (expected USD, got ${pkgCur})`,
        });
      }
      const amountUSD = Number(pkg.price).toFixed(2);
      expectedMinor = usdToKesMinor(amountUSD);
    }

    const paidMinor = typeof d.amount === 'number' ? d.amount : null;

    if (!Number.isFinite(expectedMinor) || expectedMinor <= 0 || paidMinor == null || paidMinor !== expectedMinor) {
      await client.query(
        `UPDATE payments
            SET status = 'Failed',
                updated_at = NOW(),
                meta = COALESCE(meta,'{}'::jsonb) ||
                      jsonb_build_object(
                        'failReason','amount_mismatch',
                        'expectedMinor', $1::int,
                        'paidMinor', $2::int,
                        'fxUsdToKes', $3::numeric
                      )
          WHERE id = $4::int`,
        [expectedMinor, paidMinor, FX_USD_TO_KES, payment.id]
      );
      await client.query('COMMIT');
      return res.json({
        ok: false,
        status: 'failed',
        message: 'amount-mismatch',
        reference,
        expectedMinor,
        paidMinor,
      });
    }

    // Capture details (do not overwrite intent fields)
    const providerId = d.id != null ? String(d.id) : null;
    const payerEmail = d.customer?.email || null;
    const feesMinor = typeof d.fees === 'number' ? d.fees : null;

    const capturedAmountKes = (paidMinor / 100).toFixed(2);
    const feeKes = feesMinor != null ? Number((feesMinor / 100).toFixed(2)) : null;

    await client.query(
  `UPDATE payments
      SET capture_id   = COALESCE($1::text, capture_id),
          payer_email  = COALESCE($2::text, payer_email),
          fee_total    = COALESCE($3::numeric, fee_total),
          fee_currency = CASE WHEN $3 IS NOT NULL THEN 'KES' ELSE fee_currency END,
          meta = COALESCE(meta,'{}'::jsonb) ||
                jsonb_build_object(
                  'capturedCurrency', 'KES',
                  'capturedAmountKes', $4::text,
                  'capturedAmountMinor', $5::int,
                  'paystackStatus', 'success',
                  'provider', 'PAYSTACK',
                  'providerId', COALESCE($1::text, capture_id)
                ),
          updated_at = NOW()
    WHERE id = $6::int`,
  [providerId, payerEmail, feeKes, capturedAmountKes, paidMinor, payment.id]
);


    // Finalize + credit exactly once
    const { tokens, credits } = await creditTokensAndCompletePayment(client, {
      paymentId: payment.id,
      userId: payment.user_id,
      packageId: payment.package_id,
    });

    await client.query('COMMIT');
    return res.json({
      ok: true,
      status: 'success',
      reference,
      tokensBalance: tokens,
      creditsPurchased: credits,
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}

    // Make provider errors readable on the client (instead of generic 500)
    const status = Number(e?.statusCode) || 500;

    console.error('[paystack][verifyAndFinalize] ERROR', {
      reference,
      status,
      message: e?.message,
      provider: e?.provider,
      http: e?.http,
    });

    return res.status(status).json({
      ok: false,
      status: 'failed',
      message: 'verify-finalize-failed',
      reference,
      error: e?.message || 'unknown',
      provider: e?.provider,
      http: e?.http,
    });
  } finally {
    client.release();
  }
}
