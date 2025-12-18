// apps/backend/controllers/paymentsController.js (or your existing controller file)

import { stkPushC2B } from '../services/mpesaService.js';
import validatePayment from '../validators/paymentValidation.js';
import { normalizePhoneNumber } from '../utils/phoneUtils.js';
import pool from '../config/db.js';

/* ------------------------------------------------------------------ */
/* Shared confirm helper (SINGLE source of truth for “complete+credit”)*/
/* ------------------------------------------------------------------ */
function normStatus(s) {
  return String(s || '').trim().toLowerCase();
}

function isSettledPaymentStatus(s) {
  const v = normStatus(s);
  // your payments_status_check allows both Success + Completed
  return v === 'completed' || v === 'success';
}

function isPendingPaymentStatus(s) {
  return normStatus(s) === 'pending';
}

async function confirmMpesaPaymentTx(client, payRow) {
  // idempotent (Success/Completed are both treated as settled)
  if (isSettledPaymentStatus(payRow.status)) {
    return { ok: true, alreadyCompleted: true, payment: payRow };
  }

  if (!isPendingPaymentStatus(payRow.status)) {
    return {
      ok: false,
      status: String(payRow.status),
      message: `Payment already ${payRow.status}`,
    };
  }

  // needs receipt (callback not arrived yet)
  if (!payRow.mpesa_reference) {
    return { ok: false, status: 'pending', message: 'not-success-yet' };
  }

  // meta parsing
  let meta = {};
  try {
    meta =
      typeof payRow.meta === 'string'
        ? JSON.parse(payRow.meta)
        : payRow.meta || {};
  } catch {
    meta = {};
  }

  const expectedMinor = Number(meta.expectedKesMinor);
  const paidMinor = meta.paidKesMinor != null ? Number(meta.paidKesMinor) : null;

  // fail closed (don’t throw -> don’t 500)
  if (!Number.isFinite(expectedMinor) || expectedMinor <= 0) {
    await client.query(
      `UPDATE payments
          SET status='Failed',
              meta = COALESCE(meta,'{}'::jsonb) ||
                    jsonb_build_object('failReason','missing_expectedKesMinor'),
              updated_at=NOW()
        WHERE id=$1 AND status='Pending'`,
      [payRow.id],
    );
    return { ok: false, status: 'failed', message: 'missing-expectedKesMinor' };
  }

  // if we have paid amount, enforce it
  if (paidMinor != null && paidMinor !== expectedMinor) {
    await client.query(
      `UPDATE payments
          SET status='Failed',
              meta = COALESCE(meta,'{}'::jsonb) ||
                    jsonb_build_object(
                      'failReason','amount_mismatch',
                      'expectedMinor',$2,
                      'paidMinor',$3
                    ),
              updated_at=NOW()
        WHERE id=$1 AND status='Pending'`,
      [payRow.id, expectedMinor, paidMinor],
    );

    return {
      ok: false,
      status: 'failed',
      message: 'amount-mismatch',
      expectedMinor,
      paidMinor,
    };
  }

  // mark completed first (row locked by caller)
  const upd = await client.query(
    `UPDATE payments
        SET status='Completed',
            updated_at=NOW()
      WHERE id=$1 AND status='Pending'
      RETURNING *`,
    [payRow.id],
  );

  const completedPay = upd.rows[0];

  // credit tokens (safe because status flipped inside txn)
  const pkg = await client.query(
    `SELECT credits FROM packages WHERE id=$1`,
    [completedPay.package_id],
  );
  if (!pkg.rowCount) throw new Error('Package not found for payment');

  const u = await client.query(
    `UPDATE users
        SET tokens = tokens + $1
      WHERE id = $2
      RETURNING tokens`,
    [pkg.rows[0].credits, completedPay.user_id],
  );

  return { ok: true, payment: completedPay, tokens: u.rows[0].tokens };
}


/* ------------------------------------------------------------------ */
/* Fetch available packages                                            */
/* ------------------------------------------------------------------ */
export const getPackages = async (req, res) => {
  try {
    const q = (req.query.currency || '').toUpperCase();
    const params = [];
    let sql = 'SELECT id, credits, price, currency, offer FROM packages';

    if (q === 'USD' || q === 'KES') {
      sql += ' WHERE currency = $1';
      params.push(q);
    }

    sql += ' ORDER BY credits ASC';

    const result = await pool.query(sql, params);
    if (!result.rows.length) return res.status(404).json({ message: 'No packages found' });
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error('Error fetching packages:', error?.message || error);
    return res.status(500).json({ message: 'Failed to fetch packages' });
  }
};

/* ------------------------------------------------------------------ */
/* Initialize M-Pesa payment (KES-only, creates DB row first)           */
/* ------------------------------------------------------------------ */
// ✅ UPDATED: initializeMpesaPayment with idempotency key support
export const initializeMpesaPayment = async (req, res) => {
  console.log('Initializing MPESA payment. Original request body:', req.body);

  // Normalize phone number early
  const rawPhone = req.body?.phone;
  req.body.phone = normalizePhoneNumber(rawPhone);
  console.log('Normalized phone number:', req.body.phone);

  // Validate request shape (even if validator expects amount; server is source of truth)
  const { error, value } = validatePayment(req.body);
  if (error) {
    console.error('Validation error:', error.details);
    return res.status(400).json({
      message: 'Validation error',
      details: error.details.map((err) => err.message),
    });
  }

  const { phone, packageId, paymentMethod } = value;

  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: 'Unauthorized: User not authenticated' });

  // ✅ NEW: idempotency key (optional)
  const idemKey = String(req.get('x-idempotency-key') || '').trim() || null;

  try {
    if (String(paymentMethod || '').toUpperCase() !== 'MPESA') {
      return res.status(400).json({ message: 'Invalid payment method. Use MPESA.' });
    }

    // Load package (server is source of truth)
    const pkgRes = await pool.query(
      'SELECT id, price, currency, credits, offer FROM packages WHERE id = $1',
      [packageId]
    );
    const pkg = pkgRes.rows[0];
    if (!pkg) return res.status(404).json({ message: 'Package not found' });

    // KES-only guard
    const pkgCurrency = String(pkg.currency || '').toUpperCase();
    if (pkgCurrency !== 'KES') {
      return res.status(400).json({
        message: 'MPESA requires KES packages (server enforces this)',
        packageCurrency: pkgCurrency,
      });
    }

    // Daraja requires integer KES
    const priceKesMajor = Number(pkg.price);
    if (!Number.isFinite(priceKesMajor) || priceKesMajor <= 0) {
      return res.status(400).json({ message: 'Invalid package price' });
    }

    const amountKesInt = Math.max(1, Math.round(priceKesMajor)); // integer KES
    const expectedKesMinor = amountKesInt * 100;

    // ✅ NEW: if idemKey exists, reuse a prior pending row for this user+package+idemKey
    if (idemKey) {
      const existing = await pool.query(
        `SELECT id, transaction_id, status, meta
           FROM payments
          WHERE user_id=$1
            AND package_id=$2
            AND payment_method='MPESA'
            AND status='Pending'
            AND (meta->>'idemKey') = $3
          ORDER BY created_at DESC
          LIMIT 1`,
        [userId, packageId, idemKey]
      );

      if (existing.rowCount) {
        const row = existing.rows[0];
        return res.status(200).json({
          paymentId: row.id,
          transactionId: row.transaction_id,
          message: 'Payment already initialized (idempotent).',
          reuse: true,
          charge: { currency: 'KES', expectedKesInt: amountKesInt, expectedKesMinor },
          package: { id: pkg.id, credits: pkg.credits, offer: pkg.offer },
        });
      }
    }

    // Create Pending row FIRST
    const ins = await pool.query(
      `
      INSERT INTO payments (user_id, package_id, amount, currency, payment_method, provider, status, meta)
      VALUES ($1, $2, $3, 'KES', 'MPESA', 'MPESA', 'Pending',
        jsonb_build_object(
          'kind','tokens',
          'expectedKesInt',$4,
          'expectedKesMinor',$5,
          'idemKey',$6
        )
      )
      RETURNING id
      `,
      [userId, packageId, amountKesInt.toFixed(2), amountKesInt, expectedKesMinor, idemKey]
    );

    const paymentId = ins.rows[0]?.id;
    if (!paymentId) return res.status(500).json({ message: 'Failed to create payment record' });

    // Call STK Push (NO DB writes in service)
    let stk;
    try {
      stk = await stkPushC2B({
        phone,
        amount: amountKesInt,
        // callbackUrl: process.env.MPESA_CALLBACK_URL,
      });
    } catch (stkError) {
      console.error('Error during stkPushC2B call:', stkError?.response?.data || stkError?.message || stkError);

      await pool.query(
        `UPDATE payments
            SET status='Failed',
                meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('failReason','stk_push_failed'),
                updated_at=NOW()
          WHERE id=$1`,
        [paymentId]
      );

      return res.status(502).json({
        message: 'Failed to process payment (STK push failed)',
        error: stkError?.message || 'stk_push_failed',
      });
    }

    const checkoutId = stk?.CheckoutRequestID || stk?.data?.CheckoutRequestID || null;
    if (!checkoutId) {
      await pool.query(
        `UPDATE payments
            SET status='Failed',
                meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('failReason','missing_checkout_request_id'),
                updated_at=NOW()
          WHERE id=$1`,
        [paymentId]
      );
      return res.status(502).json({ message: 'Invalid response from M-Pesa (missing CheckoutRequestID)' });
    }

    // Persist CheckoutRequestID
    await pool.query(
      `UPDATE payments SET transaction_id=$1, updated_at=NOW() WHERE id=$2`,
      [checkoutId, paymentId]
    );

    return res.status(200).json({
      paymentId,
      transactionId: checkoutId,
      message: 'Payment initialized successfully. Complete the transaction on your phone.',
      charge: { currency: 'KES', expectedKesInt: amountKesInt, expectedKesMinor },
      package: { id: pkg.id, credits: pkg.credits, offer: pkg.offer },
      idemKey: idemKey || undefined,
    });
  } catch (err) {
    console.error('Payment initialization error:', err?.message || err);
    return res.status(500).json({ message: 'Failed to initialize payment', error: err?.message || 'unknown' });
  }
};

/* ------------------------------------------------------------------ */
/* Confirm MPESA (idempotent, row-locked, validates optional paid amt) */
/* ------------------------------------------------------------------ */
export const confirmMpesaPayment = async (req, res) => {
  const { transactionReference } = req.body || {};
  if (!transactionReference) {
    return res.status(400).json({ message: 'Missing transaction reference.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const p = await client.query(
      `SELECT * FROM payments WHERE transaction_id=$1 FOR UPDATE`,
      [String(transactionReference).trim()]
    );

    if (!p.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment not found.' });
    }

    const pay = p.rows[0];

    // If callback hasn't arrived yet, keep pending (FE can poll)
    if (String(pay.status).toLowerCase() === 'pending' && !pay.mpesa_reference) {
      await client.query('COMMIT');
      return res.status(200).json({
        ok: false,
        status: 'pending',
        message: 'not-success-yet',
        transactionId: pay.transaction_id,
      });
    }

    const result = await confirmMpesaPaymentTx(client, pay);

    await client.query('COMMIT');

    if (!result.ok && result.status === 'pending') return res.status(200).json(result);
    if (!result.ok && result.status === 'failed') return res.status(400).json(result);
    if (!result.ok) return res.status(400).json(result);

    return res.status(200).json({
      ...result,
      message: result.alreadyCompleted ? 'Already confirmed.' : 'Payment confirmed and tokens credited.',
    });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error confirming payment:', e);
    return res.status(500).json({ message: 'Internal server error.', error: e?.message || String(e) });
  } finally {
    client.release();
  }
};

/* ------------------------------------------------------------------ */
/* Manual fallback if callback didn’t update DB                         */
/* - patches receipt + optional paid amount into meta                   */
/* - then delegates to same confirm logic (idempotent)                  */
/* ------------------------------------------------------------------ */
export const updateMpesaReference = async (req, res) => {
  const { transactionReference, mpesaReference, paidKesInt } = req.body || {};
  if (!transactionReference || !mpesaReference) {
    return res.status(400).json({ message: 'Missing required parameters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const p = await client.query(
      `SELECT * FROM payments WHERE transaction_id=$1 FOR UPDATE`,
      [String(transactionReference).trim()]
    );

    if (!p.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Payment record not found.' });
    }

    const pay = p.rows[0];

    // idempotent: if already completed, do NOT re-credit
    if (String(pay.status).toLowerCase() === 'completed') {
      await client.query('COMMIT');
      return res.status(200).json({
        ok: true,
        alreadyCompleted: true,
        message: 'Already completed.',
        payment: pay,
      });
    }

    if (String(pay.status).toLowerCase() !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Payment already ${pay.status}` });
    }

    // Prevent overriding an existing receipt with a different one
    const incomingReceipt = String(mpesaReference).trim();
    const existingReceipt = pay.mpesa_reference ? String(pay.mpesa_reference).trim() : null;
    if (existingReceipt && existingReceipt !== incomingReceipt) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Payment already has an M-Pesa receipt on record. Cannot override.',
        existingMpesaReference: existingReceipt,
      });
    }

    const paidInt = Number.isFinite(Number(paidKesInt)) ? Math.max(0, Math.round(Number(paidKesInt))) : null;
    const paidMinor = paidInt != null ? paidInt * 100 : null;

    const patch = {
      manualReceiptUpdate: true,
      manualReceiptAt: new Date().toISOString(),
      mpesaReceiptNumber: incomingReceipt,
      paidKesInt: paidInt,
      paidKesMinor: paidMinor,
    };

    // Patch receipt + meta, keep status Pending (confirm step finalizes)
    await client.query(
      `UPDATE payments
          SET mpesa_reference = COALESCE(mpesa_reference, $2),
              meta = COALESCE(meta,'{}'::jsonb) || $3::jsonb,
              updated_at=NOW()
        WHERE id=$1 AND status='Pending'`,
      [pay.id, incomingReceipt, JSON.stringify(patch)]
    );

    // Re-read locked row and finalize via shared logic
    const fresh = await client.query(`SELECT * FROM payments WHERE id=$1 FOR UPDATE`, [pay.id]);
    const result = await confirmMpesaPaymentTx(client, fresh.rows[0]);

    await client.query('COMMIT');

    if (!result.ok && result.status === 'pending') return res.status(200).json(result);
    if (!result.ok && result.status === 'failed') return res.status(400).json(result);
    if (!result.ok) return res.status(400).json(result);

    return res.status(200).json({
      ...result,
      message: result.alreadyCompleted
        ? 'Already confirmed.'
        : 'M-Pesa reference saved and payment confirmed. Tokens credited.',
    });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Error updating M-Pesa reference:', error);
    return res.status(500).json({ message: 'Internal server error.', error: error?.message || String(error) });
  } finally {
    client.release();
  }
};
