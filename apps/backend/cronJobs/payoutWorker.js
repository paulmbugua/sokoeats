// apps/backend/cronJobs/payoutWorker.js
import 'dotenv/config';
import pkg from 'bullmq';
const { Queue, Worker, QueueScheduler } = pkg;

import Stripe from 'stripe';
import express from 'express';
import pool, { rollbackQuiet } from '../config/db.js';
import { createRedis } from './redisConnection.js';

// ────────────────────────────────────────────────────────────────
// Utilities
// ────────────────────────────────────────────────────────────────
async function ensureRedisUp(conn) {
  if (!conn) return false;
  try {
    if (typeof conn.connect === 'function') await conn.connect();
    if (typeof conn.ping === 'function') await conn.ping();
    return true;
  } catch {
    return false;
  }
}

function parseDestination(dest) {
  if (!dest) return {};
  if (typeof dest === 'string') {
    try {
      return JSON.parse(dest);
    } catch {
      return {};
    }
  }
  return dest;
}

// ────────────────────────────────────────────────────────────────
/** Redis & Stripe */
// ────────────────────────────────────────────────────────────────
const connection = createRedis(); // may be null if DISABLE_REDIS=true

const stripeSecret = process.env.STRIPE_SECRET || '';
const stripe = stripeSecret
  ? new Stripe(stripeSecret, { apiVersion: '2023-10-16' })
  : null;

// ────────────────────────────────────────────────────────────────
/** BullMQ objects (created only if Redis is reachable) */
// ────────────────────────────────────────────────────────────────
let payoutsQueue = null;
let worker = null;
let queueScheduler = null;

const startBull = async () => {
  const ok = await ensureRedisUp(connection);
  if (!ok) {
    console.warn(
      '[payouts] Redis not reachable/disabled; skipping queue/worker startup.',
    );
    return;
  }

  if (typeof QueueScheduler === 'function') {
    queueScheduler = new QueueScheduler('payouts', { connection });
  } else {
    console.log(
      '[payouts] QueueScheduler not available in this BullMQ version—continuing without it.',
    );
  }

  payoutsQueue = new Queue('payouts', { connection });

  if (process.env.START_PAYOUT_WORKER === 'true') {
    const concurrency = Number(process.env.PAYOUT_WORKER_CONCURRENCY || 2);
    worker = new Worker('payouts', processor, { connection, concurrency });

    worker.on('completed', (job) => console.log('[payouts] completed', job.id));
    worker.on('failed', (job, err) =>
      console.error('[payouts] failed', job?.id, err?.message),
    );
  }
};

// ────────────────────────────────────────────────────────────────
/** Public enqueue helper */
// ────────────────────────────────────────────────────────────────
export async function enqueuePayout(payoutId) {
  if (!payoutsQueue) {
    throw new Error(
      'Payout queue is unavailable (Redis down or worker not started). Try again later.',
    );
  }
  await payoutsQueue.add(
    'process',
    { payoutId },
    {
      attempts: 6,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 200,
    },
  );
}

// ────────────────────────────────────────────────────────────────
/** Provider branches */
// ────────────────────────────────────────────────────────────────
async function payWithStripe({ amount, currency, stripeConnectId, payoutId }) {
  if (!stripe) throw new Error('Stripe not configured (STRIPE_SECRET).');
  if (!stripeConnectId) throw new Error('Missing stripe_connect_id.');
  if (String(currency).toUpperCase() !== 'USD') {
    throw new Error(`Stripe branch supports USD only (got ${currency}).`);
  }

  const cents = Math.round(Number(amount) * 100);
  const tr = await stripe.transfers.create({
    amount: cents,
    currency: 'usd',
    destination: stripeConnectId,
    description: `Tutor withdrawal ${payoutId}`,
  });
  return tr.id;
}

// TODO: replace with real integrations when ready
async function payWithMpesa({ payoutId }) {
  return `mpesa_${payoutId}_placeholder`;
}

async function payWithWise({ payoutId }) {
  // Integrate with Wise Payouts API here when ready
  return `wise_${payoutId}_placeholder`;
}

// ────────────────────────────────────────────────────────────────
/** Job processor */
// ────────────────────────────────────────────────────────────────
async function processor(job) {
  let client;
  try {
    const { payoutId } = job.data;
    client = await pool.connect();
    await client.query('BEGIN');

    const { rows } = await client.query(
      'SELECT * FROM payouts WHERE id=$1 FOR UPDATE',
      [payoutId],
    );
    if (!rows.length) throw new Error('Payout not found');

    const p = rows[0];
    if (p.status !== 'queued') {
      await rollbackQuiet(client);
      return;
    }

    const dest = parseDestination(p.destination);
    const method = String(p.method || '').toLowerCase();
    const currency = String(p.currency || '').toUpperCase();
    const amount = Number(p.amount || 0);
    if (!amount || amount <= 0) throw new Error('Invalid payout amount.');

    await client.query(
      `UPDATE payouts SET status='processing', updated_at=NOW() WHERE id=$1`,
      [payoutId],
    );

    await client.query('COMMIT');
    client.release();
    client = null;

    let providerRef = null;
    if (method === 'stripe') {
      providerRef = await payWithStripe({
        amount,
        currency,
        stripeConnectId: dest.stripe_connect_id,
        payoutId: p.id,
      });
    } else if (method === 'mpesa') {
      providerRef = await payWithMpesa({
        amount,
        currency,
        mpesaPhone: dest.mpesa_phone,
        payoutId: p.id,
      });
    } else if (method === 'wise') {
      providerRef = await payWithWise({
        amount,
        currency,
        wiseEmail: dest.wise_email,
        payoutId: p.id,
      });
    } else {
      throw new Error(`Unsupported payout method: ${method}`);
    }

    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      `UPDATE payouts
         SET status='paid', provider_ref=$2, paid_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status='processing'`,
      [payoutId, providerRef],
    );

    await client.query(
      `UPDATE earnings_balances
          SET pending_amount = pending_amount - $3, updated_at = NOW()
        WHERE user_id=$1 AND currency=$2`,
      [p.tutor_id, currency, amount],
    );

    const txId = dest.transaction_id;
    if (txId) {
      await client.query(
        `UPDATE transactions SET status='Completed', updated_at=NOW() WHERE id=$1`,
        [txId],
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    if (client) {
      await rollbackQuiet(client);
    }
    try {
      const { payoutId } = job.data;
      const { rows: pRows } = await pool.query(
        'SELECT * FROM payouts WHERE id=$1',
        [payoutId],
      );
      const p = pRows[0];
      if (p && (p.status === 'queued' || p.status === 'processing')) {
        await pool.query(
          `UPDATE payouts SET status='failed', error=$2, updated_at=NOW() WHERE id=$1`,
          [payoutId, String(err.message).slice(0, 500)],
        );

        if (p.amount > 0) {
          await pool.query(
            `UPDATE earnings_balances
                SET available_amount = available_amount + $3,
                    pending_amount   = GREATEST(pending_amount - $3, 0),
                    updated_at = NOW()
              WHERE user_id=$1 AND currency=$2`,
            [
              p.tutor_id,
              String(p.currency || '').toUpperCase(),
              Number(p.amount),
            ],
          );
        }

        const dest = parseDestination(p.destination);
        if (dest.transaction_id) {
          await pool.query(
            `UPDATE transactions SET status='Failed', updated_at=NOW() WHERE id=$1`,
            [dest.transaction_id],
          );
        }
      }
    } catch (inner) {
      console.error('payoutWorker cleanup error:', inner);
    }
    throw err; // let BullMQ retry
  } finally {
    if (client) client.release();
  }
}

// ────────────────────────────────────────────────────────────────
// Bootstrap BullMQ (non-blocking)
// ────────────────────────────────────────────────────────────────
startBull().catch((e) => console.error('[payouts] start error:', e));

// ────────────────────────────────────────────────────────────────
// Health server (OPT-IN, separate port, NEVER uses API PORT)
//   Set WORKER_HEALTH_PORT=8081 to enable; leave unset/0 to disable
// ────────────────────────────────────────────────────────────────
const WORKER_HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT || 0); // 0 = disabled
if (WORKER_HEALTH_PORT > 0) {
  const healthApp = express();

  healthApp.get('/healthz', async (_req, res) => {
    try {
      if (!(await ensureRedisUp(connection))) {
        return res.status(503).send('redis not ready');
      }

      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      res.status(200).json({
        ok: true,
        workerRunning: Boolean(worker),
        queueReady: Boolean(payoutsQueue),
        time: new Date().toISOString(),
      });
    } catch (e) {
      console.error('[healthz] error', e);
      res.status(500).send('not ok');
    }
  });

  healthApp.listen(WORKER_HEALTH_PORT, () => {
    console.log(
      `[worker] health server on :${WORKER_HEALTH_PORT} (GET /healthz)`,
    );
  });
}

// ────────────────────────────────────────────────────────────────
/** Graceful shutdown (Railway sends SIGTERM on deploy/stop) */
// ────────────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down gracefully...');
  try {
    if (worker) {
      await worker.close();
      console.log('[worker] BullMQ worker closed');
    }
    if (payoutsQueue) {
      await payoutsQueue.close();
      console.log('[worker] BullMQ queue closed');
    }
    if (queueScheduler && typeof queueScheduler.close === 'function') {
      await queueScheduler.close();
      console.log('[worker] BullMQ queue scheduler closed');
    }
    if (connection && typeof connection.quit === 'function') {
      await connection.quit();
      console.log('[worker] Redis connection closed');
    }
  } catch (e) {
    console.error('[worker] shutdown error', e);
  } finally {
    process.exit(0);
  }
});
