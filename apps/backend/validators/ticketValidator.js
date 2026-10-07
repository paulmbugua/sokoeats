import Joi from 'joi';
export const createTicketSchema = Joi.object({
  orderId: Joi.string().uuid().allow('', null),
  subject: Joi.string().min(4).required(),
  body: Joi.string().min(8).required(),
  category: Joi.string().valid('order_issue','earnings','safety','account','technical','other').default('other'),
  priority: Joi.string().valid('low','normal','high','urgent').default('normal'),
}).unknown(false);
export const updateTicketSchema = Joi.object({ status: Joi.string().valid('open','pending','resolved','closed'), assignedTeam: Joi.string().valid('support','refunds','vendor-success','delivery'), priority: Joi.string().valid('low','normal','high','urgent') }).min(1);
