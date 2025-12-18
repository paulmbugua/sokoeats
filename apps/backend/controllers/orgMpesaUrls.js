import pool from '../config/db.js';

/**
 * STK Callback for Organization Subscriptions
 * - stores MpesaReceiptNumber into mpesa_reference
 * - stores ResultCode/ResultDesc + paid amount into meta for confirm() validation
 * - keeps status='pending' (confirm endpoint finalizes)
 */
export const orgStkCallback = async (req, res) => {
  console.log('🔥 ORG STK CALLBACK:', JSON.stringify(req.body, null, 2));

  let client;
  try {
    client = await pool.connect();
    client.on('error', (err) => console.error('⚠️ PG CLIENT ERROR (ignored):', err.message));
    await client.query('BEGIN');

    const stk = req.body?.Body?.stkCallback;
    if (!stk) {
      console.warn('[org-stk] missing Body.stkCallback');
      await client.query('ROLLBACK');
      return res.status(200).send('OK'); // always 200 to stop retries
    }

    const {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata,
    } = stk;

    const items = CallbackMetadata?.Item || [];
    const receipt = items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || null;
    const amountKes = items.find((i) => i.Name === 'Amount')?.Value ?? null;

    const paidKesInt =
      Number.isFinite(Number(amountKes)) ? Math.max(0, Math.round(Number(amountKes))) : null;
    const paidKesMinor = paidKesInt != null ? paidKesInt * 100 : null;

    // Always patch meta with result details (success or failure)
    const patch = {
      mpesaResultCode: Number.isFinite(Number(ResultCode)) ? Number(ResultCode) : null,
      mpesaResultDesc: ResultDesc ? String(ResultDesc).slice(0, 500) : null,
      mpesaReceiptNumber: receipt,
      paidKesInt,
      paidKesMinor,
      checkoutRequestId: CheckoutRequestID || null,
    };

    const { rowCount, rows } = await client.query(
      `UPDATE org_subscription_payments
          SET mpesa_reference = COALESCE(mpesa_reference, $1),
              meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
              updated_at = NOW()
        WHERE provider_txn_id = $2
          AND status = 'pending'
        RETURNING id, org_id, tier, cycle, currency, amount_cents, provider, status, mpesa_reference, meta`,
      [receipt, CheckoutRequestID, JSON.stringify(patch)]
    );

    if (!rowCount) {
      console.warn('[org-stk] no pending org payment for CheckoutRequestID=', CheckoutRequestID);
      await client.query('ROLLBACK');
      return res.status(200).send('OK');
    }

    console.log('💾 [org-stk] updated org payment (reference + meta):', rows[0]);

    await client.query('COMMIT');
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ [org-stk] error:', err);
    try { await client?.query('ROLLBACK'); } catch {}
    return res.status(200).send('OK'); // stop retries
  } finally {
    client?.release();
  }
};
