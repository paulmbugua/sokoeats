import pool from '../config/db.js';

export async function orgStkCallback(req, res) {
  console.log('[mpesa:org] STK callback', JSON.stringify(req.body, null, 2));

  const stk = req.body?.Body?.stkCallback;
  if (!stk) return res.status(200).send('OK');

  const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;
  const items = CallbackMetadata?.Item || [];
  const receipt =
    items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value || null;
  const amount = items.find((item) => item.Name === 'Amount')?.Value ?? null;

  try {
    await pool.query(
      `UPDATE org_fee_inbound_payments
          SET status = $2,
              mpesa_receipt = COALESCE(mpesa_receipt, $3),
              amount = COALESCE(amount, $4),
              provider_payload = COALESCE(provider_payload, '{}'::jsonb) || $5::jsonb,
              updated_at = NOW()
        WHERE checkout_request_id = $1`,
      [
        CheckoutRequestID,
        Number(ResultCode) === 0 ? 'completed' : 'failed',
        receipt,
        amount,
        JSON.stringify({ ResultCode, ResultDesc, CheckoutRequestID }),
      ],
    );
  } catch (error) {
    if (!['42P01', '42703'].includes(error?.code)) {
      console.warn('[mpesa:org] callback update failed', error?.message || error);
    }
  }

  return res.status(200).send('OK');
}
