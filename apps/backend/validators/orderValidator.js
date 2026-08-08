import Joi from 'joi';

const orderItemSchema = Joi.object({
  menuItemId: Joi.string().uuid(),
  menuItemName: Joi.string().min(2),
  quantity: Joi.number().integer().min(1).max(20).required(),
  notes: Joi.string().allow('', null),
}).or('menuItemId', 'menuItemName');

export const createOrderSchema = Joi.object({
  customerName: Joi.string().min(2).required(),
  customerEmail: Joi.string().email({ tlds: { allow: false } }).allow('', null),
  phone: Joi.string().min(9).required(),
  vendorId: Joi.string().uuid(),
  vendorSlug: Joi.string().min(2),
  deliveryAddress: Joi.string().min(5).required(),
  notes: Joi.string().allow('', null),
  discountCode: Joi.string().allow('', null),
  paymentMethod: Joi.string().valid('mpesa', 'card').required(),
  paymentReference: Joi.string().min(8).required(),
  items: Joi.array().items(orderItemSchema).min(1).required(),
}).or('vendorId', 'vendorSlug');

export const updateOrderStatusSchema = Joi.object({ status: Joi.string().valid('accepted','preparing','ready','picked_up','delivered','cancelled').required() });
