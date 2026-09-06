import Joi from 'joi';
export const deliveryActionSchema = Joi.object({
  action: Joi.string().valid('claim','accept','preparing','ready','pickup','arrive','deliver').required(),
  otp: Joi.when('action', { is: 'deliver', then: Joi.string().pattern(/^\d{6}$/).required(), otherwise: Joi.forbidden() }),
});
export const deliveryLocationSchema = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  accuracy: Joi.number().min(0).max(100).required(),
  capturedAt: Joi.string().isoDate().required(),
});
