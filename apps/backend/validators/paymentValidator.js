import Joi from 'joi';

export const checkoutPaymentSchema = Joi.object({
  method: Joi.string().valid('mpesa', 'card').required(),
  amount: Joi.number().integer().min(1).required(),
  currency: Joi.string().valid('KES').default('KES'),
  phone: Joi.string().min(9).required(),
  email: Joi.string().email({ tlds: { allow: false } }).allow('', null),
  customerName: Joi.string().min(2).allow('', null),
  callbackUrl: Joi.string().uri().allow('', null),
});
