import pool from '../config/db.js';
import crypto from 'node:crypto';

export const isCareStaff = (user) => ['admin', 'support'].includes(user.role);
export async function applicationFor(userId, db = pool) {
  const { rows } = await db.query(`SELECT u.application_reference AS reference, u.role, u.created_at AS "createdAt",
    COALESCE(c.verification_status, 'details_required') AS status, c.verification_note AS note,
    COALESCE(c.legal_business_name, u.profile->>'businessName', u.name) AS "businessName"
    FROM sokoeats_users u LEFT JOIN LATERAL (SELECT * FROM sokoeats_vendors WHERE owner_user_id=u.id ORDER BY created_at LIMIT 1) v ON true
    LEFT JOIN sokoeats_vendor_compliance c ON c.vendor_id=v.id
    WHERE u.id=$1 AND u.role IN ('vendor','merchant')`, [userId]);
  return rows[0] || null;
}
export async function authorizeConversation(user, id, db = pool, lock = false) {
  const { rows } = await db.query(`SELECT c.*, t.code, t.status FROM sokoeats_chat_conversations c
    JOIN sokoeats_tickets t ON t.id=c.ticket_id WHERE c.id=$1`, [id]);
  if (!rows[0] || (!isCareStaff(user) && rows[0].user_id !== user.id)) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (lock) {
    // Use the same ticket-then-conversation lock order as ticket-desk updates.
    await db.query('SELECT id FROM sokoeats_tickets WHERE id=$1 FOR UPDATE', [rows[0].ticket_id]);
    const locked = await db.query(`SELECT c.*,t.code,t.status FROM sokoeats_chat_conversations c
      JOIN sokoeats_tickets t ON t.id=c.ticket_id WHERE c.id=$1 FOR UPDATE OF c`, [id]);
    return locked.rows[0];
  }
  return rows[0];
}
export async function openConversation(user, db = pool) {
  // Serialize opening by user so retries and multiple devices create only one thread.
  await db.query('SELECT id FROM sokoeats_users WHERE id=$1 FOR UPDATE', [user.id]);
  const existing = await db.query('SELECT id FROM sokoeats_chat_conversations WHERE user_id=$1', [user.id]);
  if (existing.rows[0]) return existing.rows[0].id;
  const code = `SKO-HELP-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
  const ticket = await db.query(`INSERT INTO sokoeats_tickets (code, requester_name, requester_email, subject, body)
    VALUES ($1,$2,$3,$4,'Customer-care conversation') RETURNING id`, [code, user.name, user.email, user.application_reference ? `Application ${user.application_reference}` : `${user.role} customer care`]);
  const { rows } = await db.query('INSERT INTO sokoeats_chat_conversations(user_id,ticket_id) VALUES($1,$2) RETURNING id', [user.id, ticket.rows[0].id]);
  return rows[0].id;
}
export async function sendCareMessage(user, id, input, db = pool) {
  const conversation = await authorizeConversation(user, id, db, true);
  const duplicate = await db.query('SELECT * FROM sokoeats_chat_messages WHERE conversation_id=$1 AND sender_id=$2 AND client_message_id=$3', [id, user.id, input.clientMessageId]);
  if (duplicate.rows[0]) return duplicate.rows[0];
  const recent = await db.query("SELECT count(*)::int AS n FROM sokoeats_chat_messages WHERE sender_id=$1 AND created_at > NOW()-INTERVAL '1 minute'", [user.id]);
  if (recent.rows[0].n >= 30) throw Object.assign(new Error('Please wait a moment before sending another message.'), { status: 429 });
  const kind = isCareStaff(user) ? 'support' : 'customer';
  const { rows } = await db.query(`INSERT INTO sokoeats_chat_messages(conversation_id,sequence,client_message_id,sender_id,sender_kind,body)
    VALUES($1,$2,$3,$4,$5,$6) RETURNING *`, [id, conversation.version + 1, input.clientMessageId, user.id, kind, input.body]);
  await db.query(`UPDATE sokoeats_chat_conversations SET version=version+1, updated_at=NOW(),
    assigned_user_id=CASE WHEN $2='support' THEN COALESCE(assigned_user_id,$3) ELSE assigned_user_id END WHERE id=$1`, [id, kind, user.id]);
  await db.query("UPDATE sokoeats_tickets SET status=$2,updated_at=NOW() WHERE id=$1", [conversation.ticket_id, kind === 'customer' ? 'open' : 'pending']);
  return rows[0];
}
export async function careSnapshot(user, id, before, db = pool) {
  const c = await authorizeConversation(user, id, db);
  const result = await db.query(`SELECT m.id,m.sequence,m.client_message_id AS "clientMessageId",m.sender_kind AS "senderKind",
    CASE WHEN m.sender_kind='support' THEN 'Customer care' ELSE u.name END AS "senderName",m.body,m.created_at AS "createdAt"
    FROM sokoeats_chat_messages m JOIN sokoeats_users u ON u.id=m.sender_id
    WHERE conversation_id=$1 AND ($2::integer IS NULL OR sequence<$2) ORDER BY sequence DESC LIMIT 51`, [id, before || null]);
  const account = await db.query('SELECT name,email,role,application_reference FROM sokoeats_users WHERE id=$1', [c.user_id]);
  return { conversation: { id: c.id, code: c.code, status: c.status, version: c.version, customerReadSequence: c.customer_read_sequence, staffReadSequence: c.staff_read_sequence,
    customerName: account.rows[0].name, role: account.rows[0].role, applicationReference: account.rows[0].application_reference, assigned: !!c.assigned_user_id },
    messages: result.rows.slice(0, 50).reverse(), hasOlder: result.rows.length > 50 };
}
