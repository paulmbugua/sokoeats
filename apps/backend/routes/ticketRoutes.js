import { Router } from 'express';
import { createTicket, listTickets, updateTicket } from '../controllers/ticketController.js';
import { validate } from '../validators/validate.js';
import { createTicketSchema, updateTicketSchema } from '../validators/ticketValidator.js';
const router = Router();
router.get('/tickets', listTickets);
router.post('/tickets', validate(createTicketSchema), createTicket);
router.patch('/tickets/:id', validate(updateTicketSchema), updateTicket);
export default router;
