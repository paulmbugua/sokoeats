import Joi from 'joi';

const item = Joi.object({
  menuItemId: Joi.string().uuid().required(),
  quantity: Joi.number().integer().min(1).max(20).required(),
  notes: Joi.string().allow('', null),
});

export const pricingQuoteSchema = Joi.object({
  vendorId: Joi.string().uuid(),
  vendorSlug: Joi.string().min(2),
  items: Joi.array().items(item).min(1).required(),
  deliveryAddress: Joi.string().min(5).required(),
  city: Joi.string().min(2).max(80).allow('', null),
  latitude: Joi.number().min(-90).max(90),
  longitude: Joi.number().min(-180).max(180),
  discountCode: Joi.string().allow('', null),
}).or('vendorId', 'vendorSlug').and('latitude', 'longitude');
