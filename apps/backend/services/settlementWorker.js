import pool from '../config/db.js';
import { processDueSettlements } from './financeService.js';
import { initiatePaystackTransfer } from './financeProvider.js';
import { completePayoutBatch, createPayoutBatches } from './payoutBatchService.js';

let running = false;

async function claimPayoutBatch() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT * FROM sokoeats_payout_batches
       WHERE status='scheduled' AND scheduled_for<=NOW()
       ORDER BY scheduled_for FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    if (!rows[0]) { await client.query('COMMIT'); return null; }
    const result = await client.query(`UPDATE sokoeats_payout_batches SET status='processing',updated_at=NOW() WHERE id=$1 RETURNING *`, [rows[0].id]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
}

async function completeProviderPayout(batch, provider) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const status = provider.status === 'success' ? 'paid' : provider.status === 'failed' ? 'failed' : 'queued';
    const { rows } = await client.query(
      `UPDATE sokoeats_payout_batches SET status=$2,provider_reference=$3,provider_payload=provider_payload || $4::jsonb,
       paid_at=CASE WHEN $2='paid' THEN NOW() ELSE paid_at END,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [batch.id, status, provider.transfer_code || null, provider],
    );
    if (status === 'paid') await completePayoutBatch(client, rows[0], provider);
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
    const batches = await createPayoutBatches(client);
    await client.query('COMMIT');
    if (payouts.length) console.info('[SokoEats][Settlement] due-payouts-created', { count: payouts.length });
    if (batches.length) console.info('[SokoEats][Settlement] payout-batches-created', { count: batches.length });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[SokoEats][Settlement] sweep-failed', { message: error.message });
  } finally {
    client.release();
  }

  try {
    if (process.env.AUTO_EXECUTE_PAYOUTS === 'true') {
      let payout;
      while ((payout = await claimPayoutBatch())) {
        try {
          const provider = await initiatePaystackTransfer({ reference: payout.reference, amount: payout.amount, recipientCode: payout.recipient_code, reason: `SokoEats ${payout.beneficiary_type} daily settlement` });
          await completeProviderPayout(payout, provider);
          console.info('[SokoEats][Settlement] payout-submitted', { reference: payout.reference, providerStatus: provider.status });
        } catch (error) {
          await pool.query(`UPDATE sokoeats_payout_batches SET status='failed',failure_reason=$2,provider_payload=provider_payload || $3::jsonb,updated_at=NOW() WHERE id=$1`, [payout.id, error.message, error.providerPayload || {}]).catch(() => {});
          console.error('[SokoEats][Settlement] payout-failed', { reference: payout.reference, message: error.message });
        }
      }
    }
  } finally { running = false; }
}

export function startSettlementWorker() {
  if (process.env.SETTLEMENT_WORKER_ENABLED !== 'true') {
    console.info('[SokoEats][Settlement] worker-disabled');
    return async () => {};
  }
  const intervalMs = Math.max(30_000, Number(process.env.SETTLEMENT_SWEEP_MS || 60_000));
  console.info('[SokoEats][Settlement] worker-started', { intervalMs, autoExecute: process.env.AUTO_EXECUTE_PAYOUTS === 'true' });
  let activeSweep = null;
  const sweep = () => {
    if (activeSweep) return;
    activeSweep = runSettlementSweep()
      .catch(error => console.error('[SokoEats][Settlement] worker-failed', { message: error.message }))
      .finally(() => { activeSweep = null; });
  };
  sweep();
  const timer = setInterval(sweep, intervalMs);
  timer.unref?.();
  return async () => {
    clearInterval(timer);
    await activeSweep;
  };
}
