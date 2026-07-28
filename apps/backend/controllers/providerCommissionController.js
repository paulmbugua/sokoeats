import pool from '../config/db.js';
import { ensureMarketplaceSchema } from '../services/marketplaceStore.js';
import { CASH_COMMISSION_BLOCK_THRESHOLD, providerCommissionDue } from '../services/marketplaceSettlementService.js';
import { stkPushC2B } from '../services/mpesaService.js';
import { notifyEvent } from '../services/notificationEvents.js';

function authUserId(req) {
  const id = Number(req.user?.id || req.userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function normalizeKenyanPhone(value) {
  const raw = String(value || '').replace(/\D/g, '');
  if (raw.startsWith('254') && raw.length === 12) return raw;
  if (raw.startsWith('0') && raw.length === 10) return '254' + raw.slice(1);
  if ((raw.startsWith('7') || raw.startsWith('1')) && raw.length === 9) return '254' + raw;
  return raw;
}

function callbackUrl(req) {
  if (process.env.MPESA_PROVIDER_COMMISSION_CALLBACK_URL) return process.env.MPESA_PROVIDER_COMMISSION_CALLBACK_URL;
  const base = process.env.PUBLIC_API_URL || process.env.BACKEND_PUBLIC_URL || process.env.PROD_BACKEND_URL || process.env.BACKEND_URL;
  if (base) return String(base).replace(/\/$/, '') + '/api/provider/commission/mpesa-callback';
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return proto + '://' + req.get('host') + '/api/provider/commission/mpesa-callback';
}

function paymentJson(row) {
  return row && {
    id: String(row.id),
    amount: Number(row.amount || 0),
    currency: row.currency || 'KES',
    phone: row.phone,
    status: row.status,
    checkoutRequestId: row.checkout_request_id,
    merchantRequestId: row.merchant_request_id,
    mpesaReceipt: row.mpesa_receipt,
    resultCode: row.mpesa_result_code,
    resultDesc: row.mpesa_result_desc,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function applyCommissionPayment(client, providerUserId, amount) {
  let remaining = Math.max(0, Number(amount || 0));
  if (remaining <= 0) return 0;
  const { rows: debts } = await client.query(
    `SELECT id, amount, amount_paid
       FROM ekazi_provider_commission_debts
      WHERE provider_user_id = $1 AND status = 'due'
      ORDER BY created_at ASC, id ASC
      FOR UPDATE`,
    [providerUserId],
  );
  let applied = 0;
  for (const debt of debts) {
    if (remaining <= 0) break;
    const outstanding = Math.max(0, Number(debt.amount || 0) - Number(debt.amount_paid || 0));
    if (outstanding <= 0) continue;
    const pay = Math.min(outstanding, remaining);
    remaining -= pay;
    applied += pay;
    await client.query(
      `UPDATE ekazi_provider_commission_debts
          SET amount_paid = amount_paid + $2,
              status = CASE WHEN amount_paid + $2 >= amount THEN 'settled' ELSE status END,
              settled_at = CASE WHEN amount_paid + $2 >= amount THEN NOW() ELSE settled_at END,
              updated_at = NOW()
        WHERE id = $1`,
      [debt.id, pay],
    );
  }
  return applied;
}

export async function getProviderCommission(req, res) {
  const providerUserId = authUserId(req);
  if (!providerUserId) return res.status(401).json({ success: false, message: 'Not authorized' });
  await ensureMarketplaceSchema();
  try {
    const due = await providerCommissionDue(pool, providerUserId);
    const [{ rows: userRows }, { rows: paymentRows }, { rows: debtRows }] = await Promise.all([
      pool.query('SELECT phone, email, name FROM users WHERE id = $1', [providerUserId]),
      pool.query(
        `SELECT * FROM ekazi_provider_commission_payments
          WHERE provider_user_id = $1
          ORDER BY created_at DESC
          LIMIT 8`,
        [providerUserId],
      ),
      pool.query(
        `SELECT id, booking_id, amount, amount_paid, status, created_at
           FROM ekazi_provider_commission_debts
          WHERE provider_user_id = $1 AND status = 'due'
          ORDER BY created_at ASC, id ASC
          LIMIT 20`,
        [providerUserId],
      ),
    ]);
    return res.json({
      success: true,
      due,
      threshold: CASH_COMMISSION_BLOCK_THRESHOLD,
      cashBlocked: due >= CASH_COMMISSION_BLOCK_THRESHOLD,
      defaultPhone: userRows[0]?.phone || '',
      payments: paymentRows.map(paymentJson),
      debts: debtRows.map((row) => ({
        id: String(row.id),
        bookingId: row.booking_id ? String(row.booking_id) : null,
        amount: Number(row.amount || 0),
        amountPaid: Number(row.amount_paid || 0),
        outstanding: Math.max(0, Number(row.amount || 0) - Number(row.amount_paid || 0)),
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error('[provider-commission] summary error', error);
    return res.status(500).json({ success: false, message: 'Could not load commission balance' });
  }
}

export async function initiateProviderCommissionPayment(req, res) {
  const providerUserId = authUserId(req);
  if (!providerUserId) return res.status(401).json({ success: false, message: 'Not authorized' });
  await ensureMarketplaceSchema();
  const phone = normalizeKenyanPhone(req.body?.phone);
  if (!/^254(7|1)\d{8}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Enter a valid Kenyan M-Pesa phone number.' });
  }

  const amount = Math.ceil(await providerCommissionDue(pool, providerUserId));
  if (amount <= 0) {
    return res.status(409).json({ success: false, message: 'No commission is due right now.', due: 0 });
  }

  let payment;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO ekazi_provider_commission_payments (provider_user_id, amount, phone, status)
       VALUES ($1,$2,$3,'pending')
       RETURNING *`,
      [providerUserId, amount, phone],
    );
    payment = rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[provider-commission] payment create error', error);
    return res.status(500).json({ success: false, message: 'Could not create commission payment.' });
  } finally {
    client.release();
  }

  try {
    const response = await stkPushC2B({ phone, amount, callbackUrl: callbackUrl(req) });
    const checkoutRequestId = response?.CheckoutRequestID || null;
    const merchantRequestId = response?.MerchantRequestID || null;
    const { rows } = await pool.query(
      `UPDATE ekazi_provider_commission_payments
          SET status = 'processing',
              checkout_request_id = $2,
              merchant_request_id = $3,
              raw_request = $4::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [payment.id, checkoutRequestId, merchantRequestId, JSON.stringify(response || {})],
    );
    return res.status(201).json({
      success: true,
      message: 'M-Pesa prompt sent. Enter your PIN to clear your Ekazi commission.',
      payment: paymentJson(rows[0]),
      due: amount,
    });
  } catch (error) {
    console.error('[provider-commission] stk error', error);
    await pool.query(
      `UPDATE ekazi_provider_commission_payments
          SET status='failed', mpesa_result_desc=$2, updated_at=NOW()
        WHERE id=$1`,
      [payment.id, String(error?.message || error).slice(0, 500)],
    );
    return res.status(502).json({ success: false, message: error?.message || 'M-Pesa prompt could not be sent.' });
  }
}

export async function getProviderCommissionPayment(req, res) {
  const providerUserId = authUserId(req);
  if (!providerUserId) return res.status(401).json({ success: false, message: 'Not authorized' });
  await ensureMarketplaceSchema();
  const { rows } = await pool.query(
    'SELECT * FROM ekazi_provider_commission_payments WHERE id = $1 AND provider_user_id = $2',
    [req.params.id, providerUserId],
  );
  if (!rows[0]) return res.status(404).json({ success: false, message: 'Payment not found' });
  const due = await providerCommissionDue(pool, providerUserId);
  return res.json({ success: true, payment: paymentJson(rows[0]), due, cashBlocked: due >= CASH_COMMISSION_BLOCK_THRESHOLD });
}

export async function providerCommissionMpesaCallback(req, res) {
  await ensureMarketplaceSchema();
  const callback = req.body?.Body?.stkCallback || req.body?.stkCallback || req.body;
  const checkoutRequestId = callback?.CheckoutRequestID;
  const resultCode = Number(callback?.ResultCode ?? -1);
  const resultDesc = callback?.ResultDesc || null;
  const items = callback?.CallbackMetadata?.Item || [];
  const receipt = items.find((item) => item.Name === 'MpesaReceiptNumber')?.Value || null;
  const amount = Number(items.find((item) => item.Name === 'Amount')?.Value || 0);

  console.log('[provider-commission][mpesa-callback]', { checkoutRequestId, resultCode, receipt, amount });
  if (!checkoutRequestId) return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM ekazi_provider_commission_payments
        WHERE checkout_request_id = $1
        FOR UPDATE`,
      [checkoutRequestId],
    );
    const payment = rows[0];
    if (!payment) {
      await client.query('COMMIT');
      return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
    const success = resultCode === 0;
    await client.query(
      `UPDATE ekazi_provider_commission_payments
          SET status = $2,
              mpesa_receipt = COALESCE($3, mpesa_receipt),
              mpesa_result_code = $4,
              mpesa_result_desc = $5,
              raw_callback = $6::jsonb,
              completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
              updated_at = NOW()
        WHERE id = $1`,
      [payment.id, success ? 'completed' : 'failed', receipt, resultCode, resultDesc, JSON.stringify(req.body || {})],
    );
    if (success) {
      await applyCommissionPayment(client, payment.provider_user_id, amount || payment.amount);
    }
    await client.query('COMMIT');

    if (success) {
      const due = await providerCommissionDue(pool, payment.provider_user_id);
      void notifyEvent('EKAZI_COMMISSION_PAID', String(payment.provider_user_id), { amountPaid: amount || payment.amount, amountDue: due }).catch(() => undefined);
    }
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[provider-commission] callback error', error);
    return res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } finally {
    client.release();
  }
}
