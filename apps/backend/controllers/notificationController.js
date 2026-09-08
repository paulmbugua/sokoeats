import Joi from 'joi';
import pool from '../config/db.js';
import { pushNotification } from '../services/pushNotificationService.js';

const sendSchema = Joi.object({
  title: Joi.string().trim().min(2).max(90).required(),
  body: Joi.string().trim().min(2).max(500).required(),
  audience: Joi.string().valid('all','customers','riders','partners').default('all'),
  channel: Joi.string().valid('in_app','push','both').default('both'),
  priority: Joi.string().valid('normal','high').default('normal'),
  actionLabel: Joi.string().trim().max(40).allow('', null),
  actionUrl: Joi.string().trim().uri({ allowRelative: true }).max(500).allow('', null),
});

export async function registerPushToken(req, res, next) {
  try {
    const { value, error } = Joi.object({ token: Joi.string().pattern(/^ExponentPushToken\[[^\]]+\]$/).required(), platform: Joi.string().valid('android','ios').required(), deviceLabel: Joi.string().trim().max(120).allow('', null) }).validate(req.body);
    if (error) throw Object.assign(new Error(error.details[0].message), { status: 422 });
    await pool.query(
      `INSERT INTO sokoeats_push_tokens(user_id,token,platform,device_label)
       VALUES($1,$2,$3,$4)
       ON CONFLICT(token) DO UPDATE SET user_id=EXCLUDED.user_id,platform=EXCLUDED.platform,device_label=EXCLUDED.device_label,is_active=TRUE,last_seen_at=NOW(),updated_at=NOW()`,
      [req.authUser.id, value.token, value.platform, value.deviceLabel || null],
    );
    console.info('[SokoEats][Push] token-registered', { userId: req.authUser.id, platform: value.platform });
    res.status(201).json({ registered: true });
  } catch (error) { next(error); }
}

export async function listNotifications(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT n.id,n.title,n.body,n.audience,n.channel,n.priority,n.action_label AS "actionLabel",n.action_url AS "actionUrl",n.created_at AS "createdAt",(r.user_id IS NOT NULL) AS read
       FROM sokoeats_admin_notifications n
       LEFT JOIN sokoeats_notification_reads r ON r.notification_id=n.id AND r.user_id=$1
       LEFT JOIN sokoeats_notification_dismissals d ON d.notification_id=n.id AND d.user_id=$1
       WHERE d.user_id IS NULL AND n.channel IN ('in_app','both') AND (
         n.audience='all' OR (n.audience='customers' AND $2='customer') OR
         (n.audience='riders' AND $2 IN ('rider','courier')) OR
         (n.audience='partners' AND $2 IN ('vendor','merchant','merchant_admin'))
       ) ORDER BY n.created_at DESC LIMIT 100`,
      [req.authUser.id, req.authUser.role],
    );
    res.json({ notifications: rows, unread: rows.filter(row => !row.read).length });
  } catch (error) { next(error); }
}

export async function markNotificationRead(req, res, next) {
  try {
    await pool.query('INSERT INTO sokoeats_notification_reads(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO UPDATE SET read_at=NOW()', [req.params.id, req.authUser.id]);
    res.json({ read: true });
  } catch (error) { next(error); }
}

export async function dismissNotification(req, res, next) {
  try {
    await pool.query('INSERT INTO sokoeats_notification_dismissals(notification_id,user_id) VALUES($1,$2) ON CONFLICT DO UPDATE SET dismissed_at=NOW()', [req.params.id, req.authUser.id]);
    res.json({ dismissed: true });
  } catch (error) { next(error); }
}

export async function adminListNotifications(_req, res, next) {
  try {
    const { rows } = await pool.query(`SELECT id,title,body,audience,channel,priority,action_label AS "actionLabel",action_url AS "actionUrl",push_attempted AS "pushAttempted",push_sent AS "pushSent",push_failed AS "pushFailed",created_at AS "createdAt" FROM sokoeats_admin_notifications ORDER BY created_at DESC LIMIT 100`);
    res.json({ notifications: rows });
  } catch (error) { next(error); }
}

export async function adminSendNotification(req, res, next) {
  try {
    const { value, error } = sendSchema.validate(req.body);
    if (error) throw Object.assign(new Error(error.details[0].message), { status: 422 });
    const { rows } = await pool.query(
      `INSERT INTO sokoeats_admin_notifications(title,body,audience,channel,priority,action_label,action_url,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [value.title, value.body, value.audience, value.channel, value.priority, value.actionLabel || null, value.actionUrl || null, req.authUser.id],
    );
    const notification = rows[0];
    const delivery = value.channel === 'in_app' ? { attempted: 0, sent: 0, failed: 0 } : await pushNotification(notification);
    res.status(201).json({ notification, delivery });
  } catch (error) { next(error); }
}

export async function adminDeleteNotification(req, res, next) {
  try {
    const result = await pool.query('DELETE FROM sokoeats_admin_notifications WHERE id=$1', [req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Notification not found'), { status: 404 });
    res.json({ deleted: true });
  } catch (error) { next(error); }
}
