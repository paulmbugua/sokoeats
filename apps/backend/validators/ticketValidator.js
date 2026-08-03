import Joi from 'joi';
export const createTicketSchema = Joi.object({
  orderId: Joi.string().uuid().allow('', null),
  requesterName: Joi.string().min(2).required(),
  requesterEmail: Joi.string().email().allow('', null),
  subject: Joi.string().min(4).required(),
  body: Joi.string().min(8).required(),
  priority: Joi.string().valid('low','normal','high','urgent').default('normal'),
  assignedTeam: Joi.string().valid('support','refunds','vendor-success','delivery').default('support')
});
export const updateTicketSchema = Joi.object({ status: Joi.string().valid('open','pending','resolved','closed'), assignedTeam: Joi.string().valid('support','refunds','vendor-success','delivery'), priority: Joi.string().valid('low','normal','high','urgent') }).min(1);
