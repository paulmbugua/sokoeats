import pool from '../config/db.js';
import { applicationFor, authorizeConversation, careSnapshot, isCareStaff, openConversation, sendCareMessage } from '../services/customerCare.js';

export async function careIdentity(req, res, next) {
  try {
    req.careUser = req.authUser;
    res.set('Cache-Control', 'no-store'); next();
  } catch (error) { next(error); }
}
const transaction = async (work) => {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
};
export async function getApplication(req, res, next) {
  try { res.json({ application: await applicationFor(req.careUser.id) }); } catch (error) { next(error); }
}
export async function getOwnConversation(req, res, next) {
  try {
    const result = await pool.query('SELECT id FROM sokoeats_chat_conversations WHERE user_id=$1', [req.careUser.id]);
    res.json(result.rows[0] ? await careSnapshot(req.careUser, result.rows[0].id) : { conversation: null, messages: [], hasOlder: false });
  } catch (error) { next(error); }
}
export async function postCareMessage(req, res, next) {
  try {
    let id = req.params.id;
    await transaction(async (client) => {
      if (!id) id = await openConversation(req.careUser, client);
      await sendCareMessage(req.careUser, id, req.body, client);
    });
    res.status(201).json(await careSnapshot(req.careUser, id));
  } catch (error) { next(error); }
}
export async function getCareMessages(req, res, next) {
  try {
    const before = req.query.before ? Number(req.query.before) : undefined;
    const after = req.query.after === undefined ? -1 : Number(req.query.after);
    if ((before !== undefined && (!Number.isInteger(before) || before < 1)) || !Number.isInteger(after) || after < -1) return res.status(422).json({ message: 'Invalid message cursor.' });
    const deadline = Date.now() + (req.query.wait === '1' && !before ? 25000 : 0);
    let closed = false;
    const abort = new AbortController();
    const onClose = () => { closed = true; abort.abort(); };
    res.on('close', onClose);
    try {
      // Bounded long polling works on web, native fetch and multiple API instances.
      // Query only a small indexed row while waiting, and stop when the client disconnects.
      while (!closed) {
        const conversation = await authorizeConversation(req.careUser, req.params.id);
        if (conversation.version !== after || Date.now() >= deadline) break;
        await new Promise((resolve) => {
          const done = () => { clearTimeout(timer); abort.signal.removeEventListener('abort', done); resolve(); };
          const timer = setTimeout(done, 1000); abort.signal.addEventListener('abort', done, { once: true });
        });
      }
      if (!closed) res.json(await careSnapshot(req.careUser, req.params.id, before));
    } finally { res.off('close', onClose); }
  } catch (error) { next(error); }
}
export async function markCareRead(req, res, next) {
  try {
    const c = await authorizeConversation(req.careUser, req.params.id);
    const column = isCareStaff(req.careUser) ? 'staff_read_sequence' : 'customer_read_sequence';
    await pool.query(`UPDATE sokoeats_chat_conversations SET ${column}=GREATEST(${column},$2), version=version+CASE WHEN ${column}<$2 THEN 1 ELSE 0 END WHERE id=$1`, [c.id, Math.min(req.body.sequence, c.version)]);
    res.json({ ok: true });
  } catch (error) { next(error); }
}
export async function staffCareInbox(req, res, next) {
  try {
    if (!isCareStaff(req.careUser)) return res.status(403).json({ message: 'Customer-care staff access required.' });
    const search = String(req.query.search || '').slice(0, 120);
    const { rows } = await pool.query(`SELECT c.id,t.code,t.status,c.updated_at AS "updatedAt",u.name,u.role,u.application_reference AS "applicationReference",
      (SELECT body FROM sokoeats_chat_messages WHERE conversation_id=c.id ORDER BY sequence DESC LIMIT 1) AS preview,
      (SELECT count(*)::int FROM sokoeats_chat_messages WHERE conversation_id=c.id AND sender_kind='customer' AND sequence>c.staff_read_sequence) AS unread
      FROM sokoeats_chat_conversations c JOIN sokoeats_tickets t ON t.id=c.ticket_id JOIN sokoeats_users u ON u.id=c.user_id
      WHERE (u.name ILIKE '%'||$1||'%' OR u.application_reference ILIKE '%'||$1||'%' OR t.code ILIKE '%'||$1||'%')
      ORDER BY c.updated_at DESC LIMIT 100`, [search]);
    res.json({ conversations: rows });
  } catch (error) { next(error); }
}
export async function closeCareConversation(req, res, next) {
  try {
    if (!isCareStaff(req.careUser)) return res.status(403).json({ message: 'Customer-care staff access required.' });
    await transaction(async (db) => {
      const c = await authorizeConversation(req.careUser, req.params.id, db, true);
      await db.query('UPDATE sokoeats_tickets SET status=$2,updated_at=NOW() WHERE id=$1', [c.ticket_id, req.body.status]);
      await db.query('UPDATE sokoeats_chat_conversations SET version=version+1,updated_at=NOW() WHERE id=$1', [c.id]);
    });
    res.json(await careSnapshot(req.careUser, req.params.id));
  } catch (error) { next(error); }
}
