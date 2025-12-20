// apps/backend/controllers/payoutController.js
import pool from '../config/db.js';
import { normalizePayoutFromBody } from '../utils/payout.js';
import { enqueuePayout } from '../cronJobs/payoutWorker.js';

const MIN_WITHDRAW = { USD: 20, KES: 200 };

export const requestWithdrawal = async (req, res) => {
  const client = await pool.connect();
  try {
    const tutorId = req.user?.id;
    const currency = String(req.body.currency || '').toUpperCase();
    let amount = Number(req.body.amount || 0);

    if (!tutorId) return res.status(401).json({ message: 'Unauthorized.' });
    if (!['USD', 'KES'].includes(currency)) {
      return res.status(400).json({ message: 'Unsupported currency.' });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Amount must be > 0.' });
    }

    // Normalize amount by currency (avoid fractional cents for KES)
    amount =
      currency === 'USD' ? Math.round(amount * 100) / 100 : Math.round(amount);

    if (amount < MIN_WITHDRAW[currency]) {
      return res.status(400).json({
        message: `Minimum withdrawal is ${MIN_WITHDRAW[currency]} ${currency}.`,
      });
    }

    await client.query('BEGIN');

    // 1) Load payout prefs (must be tutor + currency match)
    const { rows: profRows } = await client.query(
      `
      SELECT
        payout_currency,
        payout_method,
        COALESCE(wise_email, (payout_destination ->> 'wise_email'))             AS wise_email,
        COALESCE(mpesa_phone_number, (payout_destination ->> 'mpesa_phone_number')) AS mpesa_phone_number
      FROM profiles
      WHERE user_id = $1 AND role = 'tutor'
      `,
      [tutorId],
    );
    if (!profRows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Payout preferences not set.' });
    }
    const prefs = profRows[0];
    if (String(prefs.payout_currency).toUpperCase() !== currency) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        message: 'Withdrawal currency must match your payout currency.',
      });
    }

    const payout = normalizePayoutFromBody(prefs, 'tutor');
    if (payout.error) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: payout.error });
    }

    // 2) Optional duplicate guard: block if an identical Pending withdrawal exists within last 2 minutes
    const { rows: dupRows } = await client.query(
      `
      SELECT id FROM transactions
      WHERE user_id = $1
        AND type = 'Withdrawal Request'
        AND status = 'Pending'
        AND currency = $2
        AND amount = $3
        AND date >= NOW() - INTERVAL '2 minutes'
      LIMIT 1
      `,
      [tutorId, currency, amount],
    );
    if (dupRows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Duplicate withdrawal request detected. Please wait a moment.',
      });
    }

    // 3) Lock balance & verify
    const { rows: balRows } = await client.query(
      `
      SELECT available_amount, pending_amount
      FROM earnings_balances
      WHERE user_id = $1 AND currency = $2
      FOR UPDATE
      `,
      [tutorId, currency],
    );
    if (!balRows.length) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ message: 'No earnings balance for this currency.' });
    }
    const { available_amount: available } = balRows[0];
    if (available < amount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Insufficient balance.' });
    }

    // 4) Move available → pending
    await client.query(
      `
      UPDATE earnings_balances
         SET available_amount = available_amount - $1,
             pending_amount   = pending_amount   + $1,
             updated_at       = NOW()
       WHERE user_id = $2 AND currency = $3
      `,
      [amount, tutorId, currency],
    );

    // Label & extra metadata for transactions row
    const methodLabel = payout.payout_method === 'mpesa' ? 'M-Pesa' : 'Wise';
    const description = `Withdrawal request of ${amount} ${currency} via ${methodLabel}`;

    // 5) Transactions (tutor-facing ledger) – include a reference placeholder
    const { rows: txRows } = await client.query(
      `
      INSERT INTO transactions
        (user_id, type, amount, description, date, status, currency, payment_method, reference, created_at, updated_at)
      VALUES
        ($1, 'Withdrawal Request', $2, $3, NOW(), 'Pending', $4, $5, NULL, NOW(), NOW())
      RETURNING id, date
      `,
      [tutorId, amount, description, currency, methodLabel],
    );
    const transactionId = txRows[0].id;

    // 6) Payouts row → queued
    const destination = {
      wise_email: payout.wise_email || null,
      mpesa_phone: payout.mpesa_phone_number || null,
      transaction_id: transactionId,
      // legacy placeholders
      stripe_connect_id: null,
      paypal_email: null,
    };

    const { rows: payoutRows } = await client.query(
      `
  INSERT INTO payouts
    (tutor_id, class_id, purchase_id, net_tokens, currency, method, amount, destination, status, created_at, updated_at)
  VALUES
    ($1, NULL, NULL, NULL, $2, $3, $4, $5, 'queued', NOW(), NOW())
  RETURNING id
  `,
      [
        tutorId, // $1 → tutor_id
        currency, // $2 → currency
        payout.payout_method, // $3 → method  (e.g. 'mpesa' / 'wise')
        amount, // $4 → amount  (the KES / USD value we just locked)
        JSON.stringify(destination), // $5 → destination (jsonb)
      ],
    );
    const payoutId = payoutRows[0].id;

    await client.query('COMMIT');

    // 7) Kick worker (after commit)
    enqueuePayout(payoutId).catch((e) =>
      console.error('enqueuePayout failed:', e),
    );

    return res.status(202).json({
      message: 'Withdrawal queued.',
      transactionId,
      payoutId,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error('requestWithdrawal error:', err);
    return res.status(500).json({ message: 'Server error.' });
  } finally {
    client.release();
  }
};
