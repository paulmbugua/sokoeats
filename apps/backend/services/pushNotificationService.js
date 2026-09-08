import pool from '../config/db.js';

export async function pushNotification(notification) {
  const { rows } = await pool.query(
    `SELECT DISTINCT t.token
       FROM sokoeats_push_tokens t
       JOIN sokoeats_users u ON u.id=t.user_id
      WHERE t.is_active=TRUE AND (
        $1='all' OR ($1='customers' AND u.role='customer') OR
        ($1='riders' AND u.role IN ('rider','courier')) OR
        ($1='partners' AND u.role IN ('vendor','merchant','merchant_admin'))
      )`,
    [notification.audience],
  );
  const tokens = rows.map(row => row.token).filter(token => /^ExponentPushToken\[[^\]]+\]$/.test(token));
  let sent = 0;
  let failed = 0;
  for (let index = 0; index < tokens.length; index += 100) {
    const chunk = tokens.slice(index, index + 100);
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(chunk.map(to => ({
          to,
          title: notification.title,
          body: notification.body,
          sound: 'default',
          priority: notification.priority === 'high' ? 'high' : 'default',
          channelId: 'orders',
          data: { notificationId: notification.id, actionUrl: notification.action_url || null },
        }))),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.errors?.[0]?.message || 'Expo push request failed');
      const tickets = Array.isArray(payload.data) ? payload.data : [payload.data];
      sent += tickets.filter(ticket => ticket?.status === 'ok').length;
      failed += tickets.filter(ticket => ticket?.status !== 'ok').length;
      const invalid = tickets.map((ticket, offset) => ticket?.details?.error === 'DeviceNotRegistered' ? chunk[offset] : null).filter(Boolean);
      if (invalid.length) await pool.query('UPDATE sokoeats_push_tokens SET is_active=FALSE,updated_at=NOW() WHERE token=ANY($1::text[])', [invalid]);
    } catch (error) {
      failed += chunk.length;
      console.error('[SokoEats][Push] delivery-failed', { message: error.message, recipients: chunk.length });
    }
  }
  await pool.query(
    'UPDATE sokoeats_admin_notifications SET push_attempted=$2,push_sent=$3,push_failed=$4 WHERE id=$1',
    [notification.id, tokens.length, sent, failed],
  );
  console.info('[SokoEats][Push] broadcast-complete', { notificationId: notification.id, attempted: tokens.length, sent, failed });
  return { attempted: tokens.length, sent, failed };
}
