import Joi from 'joi';
export const createOrderSchema = Joi.object({
  customerName: Joi.string().min(2).required(),
  customerEmail: Joi.string().email().allow('', null),
  phone: Joi.string().allow('', null),
  vendorId: Joi.string().uuid().required(),
  deliveryAddress: Joi.string().min(5).required(),
  notes: Joi.string().allow('', null),
  items: Joi.array().items(Joi.object({ menuItemId: Joi.string().uuid().required(), quantity: Joi.number().integer().min(1).max(20).required(), notes: Joi.string().allow('', null) })).min(1).required()
});
export const updateOrderStatusSchema = Joi.object({ status: Joi.string().valid('accepted','preparing','ready','picked_up','delivered','cancelled').required() });
