import pool from '../config/db.js';
import { ensureMarketplaceSchema } from './marketplaceStore.js';
import { notifyEvent } from './notificationEvents.js';
import { initiateB2CPayment } from './mpesaService.js';

export const CASH_COMMISSION_BLOCK_THRESHOLD = Number(process.env.EKAZI_CASH_COMMISSION_BLOCK_THRESHOLD || 200);

function normalizePhone(phone) {
  const raw = String(phone || '').replace(/\D/g, '');
  if (raw.startsWith('254') && raw.length === 12) return raw;
  if (raw.startsWith('0') && raw.length === 10) return '254' + raw.slice(1);
  if ((raw.startsWith('7') || raw.startsWith('1')) && raw.length === 9) return '254' + raw;
  return raw;
}

export async function providerCommissionDue(db, providerUserId) {
  await ensureMarketplaceSchema();
  const { rows } = await db.query(
    `SELECT COALESCE(SUM(GREATEST(0, amount - amount_paid)), 0)::numeric AS due
       FROM ekazi_provider_commission_debts
      WHERE provider_user_id = $1 AND status = 'due'`,
    [providerUserId],
  );
  return Number(rows[0]?.due || 0);
}

export async function assertCashBookingAllowed(db, providerUserId) {
  const due = await providerCommissionDue(db, providerUserId);
  if (due >= CASH_COMMISSION_BLOCK_THRESHOLD) {
    const err = new Error(`Provider has KES ${due.toLocaleString('en-KE')} commission due. Cash bookings are paused until they pay below KES ${CASH_COMMISSION_BLOCK_THRESHOLD}.`);
    err.statusCode = 409;
    err.code = 'PROVIDER_CASH_BLOCKED';
    err.commissionDue = due;
    throw err;
  }
  return due;
}

export async function recordBookingSettlement(db, booking) {
  await ensureMarketplaceSchema();
  const method = String(booking.payment_method || 'cash').toLowerCase();
  const commission = Math.max(0, Number(booking.organization_commission_amount || 0));
  const payout = Math.max(0, Number(booking.handyman_payout_amount || 0));

  if (method === 'cash' && commission > 0) {
    await db.query(
      `INSERT INTO ekazi_provider_commission_debts (provider_user_id, booking_id, amount)
       VALUES ($1,$2,$3)
       ON CONFLICT (booking_id) DO NOTHING`,
      [booking.handyman_user_id, booking.id, commission],
    );
    const due = await providerCommissionDue(db, booking.handyman_user_id);
    if (due >= CASH_COMMISSION_BLOCK_THRESHOLD) {
      await db.query(
        `UPDATE ekazi_provider_commission_debts
            SET notified_at = COALESCE(notified_at, NOW())
          WHERE provider_user_id = $1 AND status = 'due'`,
        [booking.handyman_user_id],
      );
      void notifyEvent('EKAZI_COMMISSION_DUE', String(booking.handyman_user_id), {
        amountDue: due,
        threshold: CASH_COMMISSION_BLOCK_THRESHOLD,
      }).catch((e) => console.warn('[settlement] commission notify failed', e?.message || e));
    }
    return { method, commissionDue: commission, dueAfter: due, payable: 0 };
  }

  if (method === 'card' && payout > 0) {
    if (String(booking.payment_status || '').toLowerCase() !== 'platform_collected') {
      return {
        method,
        commissionDue: 0,
        dueAfter: await providerCommissionDue(db, booking.handyman_user_id),
        payable: 0,
        pendingPayment: true,
      };
    }
    await db.query(
      `UPDATE ekazi_bookings
          SET provider_settlement_status = 'payable'
        WHERE id = $1`,
      [booking.id],
    );
    return { method, commissionDue: 0, dueAfter: await providerCommissionDue(db, booking.handyman_user_id), payable: payout };
  }

  return { method, commissionDue: 0, dueAfter: await providerCommissionDue(db, booking.handyman_user_id), payable: 0 };
}

async function applyCommissionOffset(db, providerUserId, payoutId, offsetAmount) {
  let remaining = Math.max(0, Number(offsetAmount || 0));
  if (remaining <= 0) return 0;
  const { rows: debts } = await db.query(
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
    await db.query(
      `UPDATE ekazi_provider_commission_debts
          SET amount_paid = amount_paid + $2,
              status = CASE WHEN amount_paid + $2 >= amount THEN 'settled' ELSE status END,
              settled_by_payout_id = CASE WHEN amount_paid + $2 >= amount THEN $3 ELSE settled_by_payout_id END,
              settled_at = CASE WHEN amount_paid + $2 >= amount THEN NOW() ELSE settled_at END
        WHERE id = $1`,
      [debt.id, pay, payoutId],
    );
  }
  return applied;
}

export async function runMondayProviderSettlements({ force = false } = {}) {
  await ensureMarketplaceSchema();
  const now = new Date();
  if (!force && now.getDay() !== 1) return { ok: true, skipped: true, reason: 'not_monday' };
  const client = await pool.connect();
  const created = [];
  try {
    await client.query('BEGIN');
    const { rows: providers } = await client.query(
      `SELECT b.handyman_user_id AS provider_user_id,
              COALESCE(SUM(b.handyman_payout_amount), 0)::numeric AS gross_payable,
              u.phone AS mpesa_phone
         FROM ekazi_bookings b
         JOIN users u ON u.id = b.handyman_user_id
        WHERE b.status = 'completed'
          AND b.payment_method = 'card'
          AND b.provider_settlement_status = 'payable'
        GROUP BY b.handyman_user_id, u.phone
        HAVING COALESCE(SUM(b.handyman_payout_amount), 0) > 0
        ORDER BY b.handyman_user_id`
    );

    for (const provider of providers) {
      const providerId = provider.provider_user_id;
      const gross = Number(provider.gross_payable || 0);
      const due = await providerCommissionDue(client, providerId);
      const offset = Math.min(gross, due);
      const net = Math.max(0, gross - offset);
      const mpesaPhone = normalizePhone(provider.mpesa_phone);
      const { rows } = await client.query(
        `INSERT INTO ekazi_provider_payouts
          (provider_user_id, gross_amount, commission_offset_amount, net_amount, mpesa_phone, status)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [providerId, gross, offset, net, mpesaPhone || null, net > 0 ? 'pending' : 'settled'],
      );
      const payout = rows[0];
      if (offset > 0) {
        await applyCommissionOffset(client, providerId, payout.id, offset);
      }
      await client.query(
        `UPDATE ekazi_bookings
            SET provider_settlement_status = $2
          WHERE handyman_user_id = $1
            AND status = 'completed'
            AND payment_method = 'card'
            AND provider_settlement_status = 'payable'`,
        [providerId, net > 0 ? 'payout_pending' : 'settled_by_commission_offset'],
      );
      created.push(payout);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  for (const payout of created) {
    if (Number(payout.net_amount || 0) <= 0) continue;
    if (!payout.mpesa_phone) {
      await pool.query(`UPDATE ekazi_provider_payouts SET status='failed', result_desc='Missing provider M-Pesa phone', updated_at=NOW() WHERE id=$1`, [payout.id]);
      continue;
    }
    try {
      const response = await initiateB2CPayment({
        phone: payout.mpesa_phone,
        amount: Number(payout.net_amount),
        remarks: `Ekazi weekly payout ${payout.id}`,
        occasion: 'Ekazi Provider Payout',
      });
      await pool.query(
        `UPDATE ekazi_provider_payouts
            SET status = 'processing',
                originator_conversation_id = $2,
                conversation_id = $3,
                raw_response = $4::jsonb,
                updated_at = NOW()
          WHERE id = $1`,
        [payout.id, response?.OriginatorConversationID || null, response?.ConversationID || null, JSON.stringify(response || {})],
      );
    } catch (error) {
      await pool.query(
        `UPDATE ekazi_provider_payouts
            SET status='failed', result_desc=$2, updated_at=NOW()
          WHERE id=$1`,
        [payout.id, String(error?.message || error).slice(0, 500)],
      );
    }
  }
  return { ok: true, payoutsCreated: created.length };
}
