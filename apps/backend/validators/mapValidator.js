import Joi from 'joi';

const lat = Joi.number().min(-90).max(90).required();
const lng = Joi.number().min(-180).max(180).required();

export const riderLocationSchema = Joi.object({
  lat,
  lng,
  heading: Joi.string().max(80).optional()
});

export const customerAddressSchema = Joi.object({
  label: Joi.string().max(80).default('Saved address'),
  address: Joi.string().min(5).max(240).required(),
  lat,
  lng,
  placeId: Joi.string().max(180).optional()
});

export const vendorLocationSchema = Joi.object({
  address: Joi.string().min(5).max(240).required(),
  lat,
  lng,
  placeId: Joi.string().max(180).optional(),
  serviceRadiusKm: Joi.number().min(1).max(30).default(5)
});