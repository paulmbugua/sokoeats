// helpers/webhooks.js
import pool from '../config/db.js';

export async function enqueueWebhook(orgId, event, payload) {
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO org_webhook_deliveries (org_id, event_type, payload, status, attempt_count, created_at)
     VALUES ($1,$2,$3::jsonb,'pending',0,now())
     RETURNING id`,
    [orgId, event, JSON.stringify(payload)],
  );
  console.log('[webhooks] enqueued', { id: row.id, orgId, event });
  return row.id;
}
