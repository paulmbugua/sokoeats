import Joi from 'joi';

export const menuAvailabilitySchema = Joi.object({
  available: Joi.boolean().required(),
});

export const ticketMessageSchema = Joi.object({
  body: Joi.string().min(2).max(2000).required(),
  internal: Joi.boolean().default(false),
});

export const ticketResolveSchema = Joi.object({
  note: Joi.string().max(500).allow('', null),
});

export const vendorOrderStatusSchema = Joi.object({
  status: Joi.string().valid('accepted', 'preparing', 'ready', 'picked_up', 'delivered', 'cancelled').required(),
});
