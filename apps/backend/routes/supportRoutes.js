import { Router } from 'express';
import { addTicketMessage, resolveTicket, supportDashboard, ticketDetails } from '../controllers/supportController.js';
import { validate } from '../validators/validate.js';
import { ticketMessageSchema, ticketResolveSchema } from '../validators/interactionValidator.js';

const router = Router();
router.get('/support/dashboard', supportDashboard);
router.get('/support/tickets/:code', ticketDetails);
router.post('/support/tickets/:code/messages', validate(ticketMessageSchema), addTicketMessage);
router.post('/support/tickets/:code/resolve', validate(ticketResolveSchema), resolveTicket);

export default router;
