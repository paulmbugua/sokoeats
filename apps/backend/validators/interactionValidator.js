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


export const incidentReportSchema = Joi.object({
  category: Joi.string().required(),
  urgency: Joi.string().required(),
  location: Joi.string().allow('', null),
  incidentTime: Joi.string().allow('', null),
  description: Joi.string().min(2).required(),
  photos: Joi.array().items(Joi.string()).default([]),
});

export const riderChatMessageSchema = Joi.object({
  body: Joi.string().min(1).max(1200).required(),
});

export const quizSubmissionSchema = Joi.object({
  selectedIndex: Joi.number().integer().min(0).required(),
});

export const vendorProfileSettingsSchema = Joi.object({
  acceptingOrders: Joi.boolean(),
  business: Joi.object().unknown(true),
  operations: Joi.array().items(Joi.object().unknown(true)),
}).unknown(true);
