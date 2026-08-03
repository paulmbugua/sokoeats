import pool from '../config/db.js';
const code = () => `TK-${Date.now().toString(36).toUpperCase().slice(-6)}`;
const ticketJson = (row) => ({ id: row.id, code: row.code, subject: row.subject, status: row.status, priority: row.priority, requesterName: row.requester_name, assignedTeam: row.assigned_team, createdAt: row.created_at });
export async function listTickets(_req, res, next) {
  try {
    const { rows } = await pool.query('SELECT * FROM sokoeats_tickets ORDER BY created_at DESC LIMIT 120');
    res.json({ tickets: rows.map(ticketJson) });
  } catch (err) { next(err); }
}
export async function createTicket(req, res, next) {
  try {
    const { orderId, requesterName, requesterEmail, subject, body, priority, assignedTeam } = req.body;
    const { rows } = await pool.query(`INSERT INTO sokoeats_tickets (code, order_id, requester_name, requester_email, subject, body, priority, assigned_team) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [code(), orderId || null, requesterName, requesterEmail || null, subject, body, priority, assignedTeam]);
    await pool.query('INSERT INTO sokoeats_ticket_messages (ticket_id, sender_name, body) VALUES ($1,$2,$3)', [rows[0].id, requesterName, body]);
    res.status(201).json({ ticket: ticketJson(rows[0]) });
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
