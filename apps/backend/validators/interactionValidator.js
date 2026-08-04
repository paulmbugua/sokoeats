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


export const riderOnboardingStepSchema = Joi.object({
  fullName: Joi.string().allow('', null),
  phoneNumber: Joi.string().allow('', null),
  city: Joi.string().allow('', null),
  vehicleType: Joi.string().allow('', null),
  make: Joi.string().allow('', null),
  model: Joi.string().allow('', null),
  plate: Joi.string().allow('', null),
  documents: Joi.object().unknown(true),
}).unknown(true);

export const inventoryStockSchema = Joi.object({
  numericStock: Joi.number().min(0).required(),
  stock: Joi.string().allow('', null),
});
