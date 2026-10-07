import pool from '../config/db.js';
const code = () => `TK-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const ticketJson = (row) => ({ id: row.id, code: row.code, orderId: row.order_id, subject: row.subject, body: row.body, status: row.status, priority: row.priority, requesterName: row.requester_name, assignedTeam: row.assigned_team, createdAt: row.created_at, updatedAt: row.updated_at });
const teamForCategory = { order_issue: 'delivery', earnings: 'refunds', safety: 'delivery', account: 'support', technical: 'support', other: 'support' };
export async function listTickets(_req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM sokoeats_tickets ORDER BY created_at DESC LIMIT 120');
    res.json({ tickets: rows.map(ticketJson) });
  } catch (err) { next(err); }
}
export async function createTicket(req, res, next) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { orderId, subject, body, priority, category } = req.body;
    const requesterName = req.authUser.name;
    const assignedTeam = teamForCategory[category] || 'support';
    if (orderId) {
      const linkedOrder = await client.query(`SELECT id FROM sokoeats_orders WHERE id=$1 AND (customer_user_id=$2 OR rider_user_id=$2)`, [orderId, req.authUser.id]);
      if (!linkedOrder.rows[0]) throw Object.assign(new Error('Choose an order assigned to this account'), { status: 422 });
    }
    const { rows } = await client.query(`INSERT INTO sokoeats_tickets (code, order_id, requester_user_id, requester_name, requester_email, subject, body, priority, assigned_team) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [code(), orderId || null, req.authUser.id, requesterName, req.authUser.email || null, subject, body, priority, assignedTeam]);
    await client.query('INSERT INTO sokoeats_ticket_messages (ticket_id, sender_name, body) VALUES ($1,$2,$3)', [rows[0].id, requesterName, body]);
    await client.query('COMMIT');
    res.status(201).json({ ticket: ticketJson(rows[0]) });
  } catch (err) { await client.query('ROLLBACK').catch(() => {}); next(err); }
  finally { client.release(); }
}
export async function listMyTickets(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM sokoeats_tickets WHERE requester_user_id=$1 ORDER BY updated_at DESC LIMIT 100', [req.authUser.id]);
    res.json({ tickets: rows.map(ticketJson) });
  } catch (err) { next(err); }
}
export async function getMyTicket(req, res, next) {
  try {
    const ticket = await pool.query('SELECT * FROM sokoeats_tickets WHERE id=$1 AND requester_user_id=$2', [req.params.id, req.authUser.id]);
    if (!ticket.rows[0]) return res.status(404).json({ message: 'Ticket not found' });
    const messages = await pool.query('SELECT id,sender_name,body,created_at FROM sokoeats_ticket_messages WHERE ticket_id=$1 AND internal=false ORDER BY created_at', [req.params.id]);
    res.json({ ticket: { ...ticketJson(ticket.rows[0]), messages: messages.rows.map((row) => ({ id: row.id, senderName: row.sender_name, body: row.body, createdAt: row.created_at })) } });
  } catch (err) { next(err); }
}
export async function updateTicket(req, res, next) {
  try {
    const fields = [];
    const values = [];
    for (const key of ['status', 'priority']) if (req.body[key]) { values.push(req.body[key]); fields.push(`${key} = $${values.length}`); }
    if (req.body.assignedTeam) { values.push(req.body.assignedTeam); fields.push(`assigned_team = $${values.length}`); }
    values.push(req.params.id);
    const { rows } = await pool.query(`UPDATE sokoeats_tickets SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    if (!rows.length) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticket: ticketJson(rows[0]) });
  } catch (err) { next(err); }
}
