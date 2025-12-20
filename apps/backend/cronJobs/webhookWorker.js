// apps/backend/workers/webhookWorker.js
// REMOVE: import fetch from 'node-fetch';  // Node 18+ has global fetch
import crypto from 'crypto';
import pool from '../config/db.js';

function sign(secret, ts, raw) {
  const h = crypto
    .createHmac('sha256', secret)
    .update(`${ts}.${raw}`)
    .digest('hex');
  return `t=${ts},v1=${h}`;
}

async function nextBatch(limit = 15) {
  const { rows } = await pool.query(
    `
    WITH cte AS (
      SELECT id
      FROM org_webhook_deliveries
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT $1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE org_webhook_deliveries d
       SET status = 'processing'
      FROM cte
     WHERE d.id = cte.id
    RETURNING
      d.id,
      d.org_id,
      d.event_type,
      d.payload::text AS body,
      (SELECT o.webhook_url    FROM organizations o WHERE o.id = d.org_id) AS webhook_url,
      (SELECT o.webhook_secret FROM organizations o WHERE o.id = d.org_id) AS webhook_secret;
    `,
    [limit],
  );
  return rows;
}

async function mark(id, status, last_error = null) {
  const sets = ['attempt_count = attempt_count + 1'];
  const vals = [];

  if (status === 'ok') {
    sets.push(`status = 'ok'`, `delivered_at = now()`);
  } else {
    sets.push(`status = 'pending'`);
  }

  if (last_error !== null) {
    sets.push('last_error = $1');
    vals.push(String(last_error).slice(0, 500));
  }

  sets.push(`updated_at = now()`);

  await pool.query(
    `UPDATE org_webhook_deliveries
        SET ${sets.join(', ')}
      WHERE id = $${vals.length + 1}`,
    [...vals, id],
  );
}

export async function runWebhookTick() {
  const batch = await nextBatch(15);

  for (const j of batch) {
    try {
      const rawBody = j.body || '{}';
      // allow test override without forcing a DB save
      const payload = (() => {
        try {
          return JSON.parse(rawBody);
        } catch {
          return {};
        }
      })();
      const url = payload.__override_url || j.webhook_url;

      if (!/^https:\/\/.+/i.test(url || '')) {
        throw new Error('Invalid webhook URL');
      }

      const ts = Math.floor(Date.now() / 1000);
      const secret = j.webhook_secret || '';
      const sig = sign(secret, ts, rawBody);

      // Node 18+: use AbortController for timeouts (timeout option is ignored)
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'DayBreak-Hook/1.0',
          'X-DayBreak-Event': j.event_type,
          'X-DayBreak-Signature': sig,
          'X-DayBreak-Timestamp': String(ts),
        },
        body: rawBody,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await mark(j.id, 'ok');
    } catch (e) {
      await mark(j.id, 'pending', e?.message || String(e));
      await pool.query(
        `UPDATE org_webhook_deliveries
            SET created_at = now() + make_interval(mins := LEAST(5, GREATEST(1, attempt_count)))
          WHERE id = $1`,
        [j.id],
      );
    }
  }
}
