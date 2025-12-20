// apps/backend/cronJobs/webhookWorkerSingleton.js (wrapper)
import pool from '../config/db.js';
import { runWebhookTick } from './webhookWorker.js';

export async function runWebhookTickSingleton() {
  const LOCK_KEY = 76451234; // any int; keep constant across all instances
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT pg_try_advisory_lock($1) AS ok',
      [LOCK_KEY],
    );
    if (!rows[0]?.ok) return; // someone else is running; skip
    await runWebhookTick();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } catch {}
    client.release();
  }
}
