// controllers/orgPaystackVerifyController.js
import fetch from 'node-fetch';
import pool from '../config/db.js';

const PAYSTACK_SECRET = (process.env.PAYSTACK_SECRET_KEY || '').trim();
if (!PAYSTACK_SECRET) throw new Error('Missing PAYSTACK_SECRET_KEY');

const PAYSTACK_CURRENCY = (
  process.env.PAYSTACK_CURRENCY || 'KES'
).toUpperCase();
if (PAYSTACK_CURRENCY !== 'KES')
  throw new Error(`PAYSTACK_CURRENCY must be KES, got ${PAYSTACK_CURRENCY}`);

async function verifyPaystack(reference) {
  const r = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    },
  );
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.status) {
    const msg = j?.message || `Paystack verify failed: ${r.status}`;
    const err = new Error(msg);
    err.statusCode = 502;
    throw err;
  }
  return j?.data;
}

// minimal: just mark org_subscription_payments completed if verified
export async function verifyAndFinalizeOrg(req, res) {
  const reference = String(req.params.reference || '').trim();
  if (!reference)
    return res
      ?.status?.(400)
      ?.json?.({ ok: false, message: 'missing-reference' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lock = await client.query(
      `SELECT * FROM org_subscription_payments
        WHERE provider='PAYSTACK'
          AND provider_order_id=$1
        ORDER BY created_at DESC
        LIMIT 1
        FOR UPDATE`,
      [reference],
    );

    const pay = lock.rows[0];
    if (!pay) {
      await client.query('ROLLBACK');
      return res
        ?.status?.(404)
        ?.json?.({ ok: false, message: 'org-payment-not-found', reference });
    }

    if (pay.status === 'completed') {
      await client.query('COMMIT');
      return res?.json?.({ ok: true, alreadyCompleted: true, reference });
    }

    const d = await verifyPaystack(reference);
    const payStatus = String(d?.status || 'pending').toLowerCase();
    if (payStatus !== 'success') {
      await client.query('COMMIT');
      return res?.json?.({ ok: false, status: payStatus, reference });
    }

    const currency = String(d?.currency || '').toUpperCase();
    if (currency !== 'KES') {
      await client.query(
        `UPDATE org_subscription_payments
            SET status='failed',
                error_message=$2,
                meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('failReason','currency_mismatch','gotCurrency',$3),
                updated_at=NOW()
          WHERE id=$1`,
        [pay.id, `currency mismatch: expected KES got ${currency}`, currency],
      );
      await client.query('COMMIT');
      return res?.json?.({
        ok: false,
        status: 'failed',
        message: 'currency-mismatch',
        reference,
      });
    }

    const expectedMinor = Number(pay?.meta?.chargeAmountMinor);
    const paidMinor = Number(d?.amount);

    if (
      !Number.isFinite(expectedMinor) ||
      expectedMinor <= 0 ||
      paidMinor !== expectedMinor
    ) {
      await client.query(
        `UPDATE org_subscription_payments
            SET status='failed',
                error_message='amount mismatch',
                meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('failReason','amount_mismatch','expectedMinor',$2,'paidMinor',$3),
                updated_at=NOW()
          WHERE id=$1`,
        [pay.id, expectedMinor, paidMinor],
      );
      await client.query('COMMIT');
      return res?.json?.({
        ok: false,
        status: 'failed',
        message: 'amount-mismatch',
        reference,
      });
    }

    await client.query(
      `UPDATE org_subscription_payments
          SET status='completed',
              provider_txn_id=$2,
              meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('capturedCurrency','KES','capturedAmountMinor',$3,'providerId',$2),
              updated_at=NOW()
        WHERE id=$1`,
      [pay.id, String(d?.id || ''), paidMinor],
    );

    await client.query('COMMIT');
    return res?.json?.({ ok: true, status: 'success', reference });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    return res?.status?.(502)?.json?.({
      ok: false,
      message: 'verify-finalize-org-failed',
      reference,
      error: e?.message,
    });
  } finally {
    client.release();
  }
}
