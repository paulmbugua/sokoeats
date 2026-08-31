import pool from '../config/db.js';
import { postPaidPayout, processDueSettlements } from './financeService.js';
import { initiatePaystackTransfer } from './financeProvider.js';

let running = false;

async function claimPayout() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT p.* FROM sokoeats_payouts p
       JOIN sokoeats_order_settlements s ON s.id=p.settlement_id
       WHERE p.status='scheduled' AND p.scheduled_for<=NOW()
         AND s.dispute_status<>'open' AND s.frozen_at IS NULL
       ORDER BY p.scheduled_for FOR UPDATE OF p SKIP LOCKED LIMIT 1`,
    );
    if (!rows[0]) { await client.query('COMMIT'); return null; }
    const result = await client.query(`UPDATE sokoeats_payouts SET status='processing',updated_at=NOW() WHERE id=$1 RETURNING *`, [rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function completeProviderPayout(payout, provider) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const status = provider.status === 'success' ? 'paid' : provider.status === 'failed' ? 'failed' : 'queued';
    const { rows } = await client.query(
      `UPDATE sokoeats_payouts SET status=$2,provider_reference=$3,provider_payload=provider_payload || $4::jsonb,
       paid_at=CASE WHEN $2='paid' THEN NOW() ELSE paid_at END,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [payout.id, status, provider.transfer_code || null, provider],
    );
    if (status === 'paid') await postPaidPayout(client, rows[0]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

export async function runSettlementSweep() {
  if (running) return;
  running = true;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const payouts = await processDueSettlements(client);
    await client.query('COMMIT');
    if (payouts.length) console.info('[SokoEats][Settlement] due-payouts-created', { count: payouts.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[SokoEats][Settlement] sweep-failed', { message: error.message });
  } finally {
    client.release();
  }

  try {
    if (process.env.AUTO_EXECUTE_PAYOUTS === 'true') {
      let payout;
      while ((payout = await claimPayout())) {
        try {
          const provider = await initiatePaystackTransfer({ reference: payout.reference, amount: payout.amount, recipientCode: payout.recipient_code, reason: `SokoEats ${payout.beneficiary_type} settlement` });
          await completeProviderPayout(payout, provider);
          console.info('[SokoEats][Settlement] payout-submitted', { reference: payout.reference, providerStatus: provider.status });
        } catch (error) {
          await pool.query(`UPDATE sokoeats_payouts SET status='failed',failure_reason=$2,provider_payload=provider_payload || $3::jsonb,updated_at=NOW() WHERE id=$1`, [payout.id, error.message, error.providerPayload || {}]).catch(() => {});
          console.error('[SokoEats][Settlement] payout-failed', { reference: payout.reference, message: error.message });
        }
      }
    }
  } finally { running = false; }
}

export function startSettlementWorker() {
  if (process.env.SETTLEMENT_WORKER_ENABLED !== 'true') {
    console.info('[SokoEats][Settlement] worker-disabled');
    return;
  }
  const intervalMs = Math.max(30_000, Number(process.env.SETTLEMENT_SWEEP_MS || 60_000));
  console.info('[SokoEats][Settlement] worker-started', { intervalMs, autoExecute: process.env.AUTO_EXECUTE_PAYOUTS === 'true' });
  void runSettlementSweep();
  const timer = setInterval(() => void runSettlementSweep(), intervalMs);
  timer.unref?.();
}
