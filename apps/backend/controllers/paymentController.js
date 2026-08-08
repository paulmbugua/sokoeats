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
  try {
    const phone = normalizeKenyanPhone(req.body.phone);
    const reference = paymentReference(req.body.method);
    const prompt = await createPaymentPrompt({
      method: req.body.method,
      amount: req.body.amount,
      currency: req.body.currency || 'KES',
      phone,
      email: req.body.email,
      customerName: req.body.customerName,
      reference,
      callbackUrl: req.body.callbackUrl,
    });

    const { rows } = await pool.query(
      `INSERT INTO sokoeats_payment_intents
        (reference, method, provider, amount, currency, status, phone, customer_email, provider_reference, action_url, prompt_message, provider_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [reference, req.body.method, prompt.provider, req.body.amount, req.body.currency || 'KES', prompt.status, phone, req.body.email || null, prompt.providerReference || null, prompt.actionUrl || null, prompt.promptMessage, prompt.payload || {}],
    );

    res.status(201).json({ payment: paymentJson(rows[0]) });
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
    if (!rows.length) return res.status(404).json({ message: 'M-Pesa payment intent not found' });
    res.json({ ok: true, payment: paymentJson(rows[0]) });
  } catch (err) { next(err); }
}