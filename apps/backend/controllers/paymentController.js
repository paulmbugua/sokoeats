import pool from '../config/db.js';
import { createPaymentPrompt, confirmGatewayPayment, normalizeKenyanPhone, paymentReference } from '../services/paymentGateway.js';

const paymentJson = (row) => ({
  reference: row.reference,
  method: row.method,
  amount: Number(row.amount),
  currency: row.currency,
  status: row.status,
  phone: row.phone,
  providerReference: row.provider_reference,
  actionUrl: row.action_url,
  promptMessage: row.prompt_message,
  simulation: Boolean(row.provider_payload?.simulation),
  createdAt: row.created_at,
  paidAt: row.paid_at,
});

export async function initiateCheckoutPayment(req, res, next) {
  const reference = paymentReference(req.body.method);
  try {
    const phone = normalizeKenyanPhone(req.body.phone);
    const method = req.body.method;
    const currency = req.body.currency || 'KES';
    const provider = method === 'mpesa' ? 'mpesa' : 'paystack';

    await pool.query(
      `INSERT INTO sokoeats_payment_intents
        (reference, method, provider, amount, currency, status, phone, customer_email, provider_payload)
       VALUES ($1,$2,$3,$4,$5,'requires_action',$6,$7,$8)`,
      [reference, method, provider, req.body.amount, currency, phone, req.body.email || null, { initiatedAt: new Date().toISOString() }],
    );

    try {
      const prompt = await createPaymentPrompt({
        method,
        amount: req.body.amount,
        currency,
        phone,
        email: req.body.email,
        customerName: req.body.customerName,
        reference,
        callbackUrl: req.body.callbackUrl,
      });

      const { rows } = await pool.query(
        `UPDATE sokoeats_payment_intents
         SET provider = $1,
             status = $2,
             provider_reference = $3,
             action_url = $4,
             prompt_message = $5,
             provider_payload = provider_payload || $6::jsonb,
             updated_at = NOW()
         WHERE reference = $7
         RETURNING *`,
        [prompt.provider, prompt.status, prompt.providerReference || null, prompt.actionUrl || null, prompt.promptMessage, prompt.payload || {}, reference],
      );

      return res.status(201).json({ payment: paymentJson(rows[0]) });
    } catch (promptErr) {
      await pool.query(
        `UPDATE sokoeats_payment_intents
         SET status = 'failed',
             prompt_message = $1,
             provider_payload = provider_payload || $2::jsonb,
             updated_at = NOW()
         WHERE reference = $3`,
        [promptErr.message || 'Payment prompt failed', { initiationError: promptErr.message || 'Payment prompt failed' }, reference],
      );
      throw promptErr;
    }
  } catch (err) { next(err); }
}
export async function confirmCheckoutPayment(req, res, next) {
  try {
    const existing = await pool.query('SELECT * FROM sokoeats_payment_intents WHERE reference = $1', [req.params.reference]);
    if (!existing.rows.length) return res.status(404).json({ message: 'Payment reference not found' });
    if (existing.rows[0].status === 'paid') return res.json({ payment: paymentJson(existing.rows[0]) });

    const confirmation = await confirmGatewayPayment(existing.rows[0]);
    const nextStatus = confirmation.status || existing.rows[0].status;
    const { rows } = await pool.query(
      `UPDATE sokoeats_payment_intents
       SET status = $1,
           provider_reference = COALESCE($2, provider_reference),
           provider_payload = provider_payload || $3::jsonb,
           paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           updated_at = NOW()
       WHERE reference = $4
       RETURNING *`,
      [nextStatus, confirmation.providerReference || null, confirmation.payload || {}, req.params.reference],
    );

    res.json({ payment: paymentJson(rows[0]) });
  } catch (err) { next(err); }
}

export async function mpesaCheckoutCallback(req, res, next) {
  try {
    const callback = req.body?.Body?.stkCallback || req.body?.stkCallback || req.body;
    const checkoutRequestId = callback?.CheckoutRequestID;
    const resultCode = Number(callback?.ResultCode);
    if (!checkoutRequestId) return res.status(422).json({ message: 'CheckoutRequestID is required' });
    const status = resultCode === 0 ? 'paid' : 'failed';
    const { rows } = await pool.query(
      `UPDATE sokoeats_payment_intents
       SET status = $1,
           provider_payload = provider_payload || $2::jsonb,
           paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END,
           updated_at = NOW()
       WHERE provider_reference = $3
       RETURNING *`,
      [status, { mpesaCallback: callback }, checkoutRequestId],
    );
    if (!rows.length) {
      console.warn('Unmatched M-Pesa callback', { checkoutRequestId, resultCode });
      return res.json({ ok: true, matched: false, message: 'M-Pesa callback accepted for an unknown or already archived payment intent' });
    }
    res.json({ ok: true, matched: true, payment: paymentJson(rows[0]) });
  } catch (err) { next(err); }
}