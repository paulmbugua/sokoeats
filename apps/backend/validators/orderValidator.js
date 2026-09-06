import Joi from 'joi';

const orderItemSchema = Joi.object({
  menuItemId: Joi.string().uuid(),
  menuItemName: Joi.string().min(2),
  quantity: Joi.number().integer().min(1).max(20).required(),
  notes: Joi.string().allow('', null),
}).or('menuItemId', 'menuItemName');

export const createOrderSchema = Joi.object({
  phone: Joi.string().min(9).allow('', null),
  vendorId: Joi.string().uuid(),
  vendorSlug: Joi.string().min(2),
  deliveryAddress: Joi.string().min(5).required(),
  recipientName: Joi.string().trim().min(2).max(100).required(),
  recipientPhone: Joi.string().pattern(/^(?:\+?254|0)?[17]\d{8}$/).required(),
  deliveryForSelf: Joi.boolean().required(),
  notes: Joi.string().allow('', null),
  discountCode: Joi.string().allow('', null),
  paymentMethod: Joi.string().valid('mpesa', 'card', 'paystack').required(),
  paymentReference: Joi.string().min(8).required(),
  pricingQuoteId: Joi.string().uuid().required(),
  items: Joi.array().items(orderItemSchema).min(1).required(),
}).or('vendorId', 'vendorSlug');

export const updateOrderStatusSchema = Joi.object({ status: Joi.string().valid('accepted','preparing','ready','picked_up','delivered','cancelled').required() });
