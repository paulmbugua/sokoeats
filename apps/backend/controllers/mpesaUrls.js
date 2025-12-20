// apps/backend/controllers/mpesaUrls.js

import pool from '../config/db.js';

export const mpesaCallback = async (req, res) => {
  console.log(
    '🔥 GOT STK CALLBACK (raw body):\n',
    JSON.stringify(req.body, null, 2),
  );

  let client;
  try {
    client = await pool.connect();
    client.on('error', (err) =>
      console.error('⚠️ PG CLIENT ERROR (ignored):', err.message),
    );
    await client.query('BEGIN');

    const stk = req.body?.Body?.stkCallback;
    if (!stk) {
      console.warn('Invalid STK callback, no Body.stkCallback');
      await client.query('ROLLBACK');
      return res.status(200).send('OK');
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;

    const items = CallbackMetadata?.Item || [];
    const receipt =
      items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value || null;
    const amountKes = items.find((i) => i.Name === 'Amount')?.Value ?? null;

    const paidKesInt = Number.isFinite(Number(amountKes))
      ? Math.max(0, Math.round(Number(amountKes)))
      : null;
    const paidKesMinor = paidKesInt != null ? paidKesInt * 100 : null;

    const patch = {
      mpesaResultCode: Number.isFinite(Number(ResultCode))
        ? Number(ResultCode)
        : null,
      mpesaResultDesc: ResultDesc ? String(ResultDesc).slice(0, 500) : null,
      mpesaReceiptNumber: receipt,
      paidKesInt,
      paidKesMinor,
      checkoutRequestId: CheckoutRequestID || null,
    };

    // Update receipt + meta, but keep status Pending (confirm endpoint finalizes)
    const { rowCount, rows } = await client.query(
      `UPDATE payments
          SET mpesa_reference = COALESCE(mpesa_reference, $1),
              meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
              updated_at = NOW()
        WHERE transaction_id = $2
          AND status = 'Pending'
        RETURNING *;`,
      [receipt, CheckoutRequestID, JSON.stringify(patch)],
    );

    if (!rowCount) {
      console.warn('No pending payment found for TX:', CheckoutRequestID);
      await client.query('ROLLBACK');
      return res.status(200).send('OK');
    }

    console.log('💾 Updated payment record (reference + meta):', rows[0]);

    await client.query('COMMIT');
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Error processing STK callback:', err);
    try {
      await client?.query('ROLLBACK');
    } catch {}
    return res.status(200).send('OK');
  } finally {
    client?.release();
  }
};

export const b2cResult = async (req, res) => {
  console.log('📬 B2C Result Callback:', JSON.stringify(req.body, null, 2));

  // Daraja nests the payload under `Result`
  const result = req.body.Result;
  if (!result) {
    console.warn('Invalid B2C callback, missing Result object');
    return res.status(400).send({ error: 'Invalid callback format' });
  }

  const {
    OriginatorConversationID,
    ConversationID,
    ResultCode,
    TransactionID, // actual M-Pesa receipt
  } = result;

  // We keyed the transaction on ConversationID in confirmCompletion:
  const mpesaRef = OriginatorConversationID || ConversationID;
  const newStatus = ResultCode === 0 ? 'Completed' : 'Failed';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateSQL = `
      UPDATE transactions
         SET status         = $2,
             mpesa_reference = $3,
             updated_at      = NOW()
       WHERE mpesa_reference = $1
       RETURNING *;
    `;
    const { rows } = await client.query(updateSQL, [
      mpesaRef,
      newStatus,
      TransactionID || null,
    ]);

    if (rows.length) {
      console.log(`✅ Transaction ${newStatus}:`, rows[0]);
    } else {
      console.warn(
        `No matching transaction found for mpesa_reference=${mpesaRef}`,
      );
    }

    await client.query('COMMIT');
    // Always return 200 OK so Daraja stops retrying
    res.status(200).send('OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error processing B2C result callback:', err);
    // still respond 200
    res.status(200).send('OK');
  } finally {
    client.release();
  }
};

export const b2cTimeout = async (req, res) => {
  console.log('⏱️ B2C Timeout Callback:', JSON.stringify(req.body, null, 2));

  // Daraja nests the payload under `Result`
  const result = req.body.Result;
  if (!result) {
    console.warn('Invalid B2C timeout callback, missing Result object');
    return res.status(400).send({ error: 'Invalid callback format' });
  }

  const { OriginatorConversationID, ConversationID, ResultDesc } = result;

  // Use the same reference you stored on the transaction
  const mpesaRef = OriginatorConversationID || ConversationID;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updateSQL = `
      UPDATE transactions
         SET status     = 'Failed',
             updated_at = NOW()
       WHERE mpesa_reference = $1
         AND status = 'Pending'
       RETURNING *;
    `;
    const { rows } = await client.query(updateSQL, [mpesaRef]);

    if (rows.length) {
      console.log(`⚠️ Transaction timed out and marked Failed:`, rows[0]);
    } else {
      console.warn(
        `No pending transaction found for mpesa_reference=${mpesaRef}`,
      );
    }

    await client.query('COMMIT');
    // Always return 200 so Daraja stops retrying
    res.status(200).send('OK');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('📉 Error processing B2C timeout callback:', err);
    // still return 200
    res.status(200).send('OK');
  } finally {
    client.release();
  }
};
