import Joi from 'joi';
export const vendorSchema = Joi.object({
  name: Joi.string().min(2).required(),
  slug: Joi.string().lowercase().pattern(/^[a-z0-9-]+$/).required(),
  cuisine: Joi.string().min(2).required(),
  status: Joi.string().valid('draft','review','active','paused').default('review'),
  prepMinutes: Joi.number().integer().min(5).max(120).default(25),
  deliveryFee: Joi.number().integer().min(0).default(150),
  minimumOrder: Joi.number().integer().min(0).default(300),
  address: Joi.string().allow('', null),
  paymentCollectionMode: Joi.string().valid('platform','direct').default('platform'),
  paymentProvider: Joi.string().valid('mpesa').default('mpesa'),
  paymentAccountType: Joi.string().valid('paybill','till','wallet').default('paybill'),
  paymentShortcode: Joi.string().pattern(/^\d{5,12}$/).default('4139123')
});
