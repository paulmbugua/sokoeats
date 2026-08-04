import { getScreenPayload, saveScreenPayload } from '../models/screenPayloadModel.js';

export async function supportDashboard(_req, res, next) {
  try {
    res.json({ dashboard: await getScreenPayload('support_dashboard_overview') });
  } catch (err) { next(err); }
}

export async function ticketDetails(req, res, next) {
  try {
    const payload = await getScreenPayload('ticket_details_sko_9214');
    if (payload.ticket.code !== req.params.code) return res.status(404).json({ message: 'Ticket not found' });
    res.json({ ticketDetails: payload });
  } catch (err) { next(err); }
}

export async function addTicketMessage(req, res, next) {
  try {
    const payload = await getScreenPayload('ticket_details_sko_9214');
    if (payload.ticket.code !== req.params.code) return res.status(404).json({ message: 'Ticket not found' });
    const time = new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Africa/Nairobi' }).format(new Date());
    payload.messages.push({
      sender: req.body.internal ? 'Internal Note' : 'Support Agent (You)',
      body: req.body.body,
      time,
      tone: req.body.internal ? 'system' : 'agent',
    });
    res.status(201).json({ ticketDetails: await saveScreenPayload('ticket_details_sko_9214', payload) });
  } catch (err) { next(err); }
}

export async function resolveTicket(req, res, next) {
  try {
    const payload = await getScreenPayload('ticket_details_sko_9214');
    if (payload.ticket.code !== req.params.code) return res.status(404).json({ message: 'Ticket not found' });
    payload.ticket.status = 'resolved';
    payload.ticket.sla = 'Completed';
    payload.activity.unshift({ label: 'Ticket Resolved', body: req.body.note || 'Support marked the ticket resolved after customer follow-up.' });
    res.json({ ticketDetails: await saveScreenPayload('ticket_details_sko_9214', payload) });
  } catch (err) { next(err); }
}
